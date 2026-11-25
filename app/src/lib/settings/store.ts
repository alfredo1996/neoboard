import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { settings, users } from "@/lib/db/schema";
import { ForbiddenError } from "@/lib/auth/errors";
import { resolveTenantId } from "@/lib/auth/tenant-id";
import {
  SettingsValidationError,
  applySettingRows,
  isProcessTenant,
  describeSetting,
  state,
  validateChanges,
  type SettingKey,
  type SettingRow,
} from "./core";

/** How long another replica can run on a stale value after an admin saves. */
export const SETTINGS_TTL_MS = 30_000;

/**
 * Read the process tenant's rows and make them the cache. One query. Never
 * another tenant's: see `isProcessTenant`.
 *
 * A SELECT that started before a write committed can finish after the write's
 * own refresh; only the newest start may land. The sequence lives in `state`
 * (globalThis), not here: instrumentation's interval and a route's save are
 * separate module copies in a production build (#1888).
 */
export async function refreshSettings(): Promise<void> {
  const tenantId = resolveTenantId();
  const seq = state.seq;
  const mine = ++seq.started;
  const rows = await db
    .select({
      key: settings.key,
      value: settings.value,
      updatedBy: settings.updatedBy,
      updatedByName: users.name,
      updatedAt: settings.updatedAt,
    })
    .from(settings)
    .leftJoin(
      users,
      and(eq(users.id, settings.updatedBy), eq(users.tenantId, tenantId)),
    )
    .where(eq(settings.tenantId, tenantId));
  if (mine < seq.applied) return;
  seq.applied = mine;
  applySettingRows(rows);
}

/**
 * Load now (the returned promise settles when the first load has), then every
 * 30 s so other replicas pick a change up. Idempotent. A failed load keeps the
 * last cache (env and defaults before the first one) and goes to `onError`.
 */
export async function startSettingsRefresh(
  onError?: (err: unknown) => void,
): Promise<void> {
  if (state.timer) return;
  const tick = () => {
    refreshSettings().catch((err) => onError?.(err));
  };
  state.timer = setInterval(tick, SETTINGS_TTL_MS);
  (state.timer as { unref?: () => void }).unref?.();
  await refreshSettings().catch((err) => onError?.(err));
}

export interface SettingChange {
  key: SettingKey;
  old: unknown;
  new: unknown;
}

/**
 * Write `changes` (`null` deletes the row, so the key falls back to env or the
 * default), reload the cache so this process applies it at once, and return
 * every key written, for the audit trail.
 *
 * The tenant's saves run one at a time (a transaction-scoped advisory lock),
 * and validation, old and new all come from the rows read under that lock, so
 * two admins can't together persist an invalid pair or audit each other's value.
 */
export async function saveSettings(
  tenantId: string,
  userId: string,
  changes: Partial<Record<SettingKey, unknown>>,
): Promise<SettingChange[]> {
  if (!isProcessTenant(tenantId)) throw new ForbiddenError();
  const changed = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`neoboard.settings:${tenantId}`}))`,
    );
    const stored = await tx
      .select({
        key: settings.key,
        value: settings.value,
        updatedBy: settings.updatedBy,
        updatedAt: settings.updatedAt,
      })
      .from(settings)
      .where(eq(settings.tenantId, tenantId));
    const before = new Map<string, SettingRow>(stored.map((r) => [r.key, r]));
    const problem = validateChanges(changes, before);
    if (problem) throw new SettingsValidationError(problem);

    const after = new Map(before);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) {
        after.delete(key);
        await tx
          .delete(settings)
          .where(and(eq(settings.tenantId, tenantId), eq(settings.key, key)));
        continue;
      }
      const row = { value, updatedBy: userId, updatedAt: new Date() };
      after.set(key, { key, ...row });
      await tx
        .insert(settings)
        .values({ tenantId, key, ...row })
        .onConflictDoUpdate({
          target: [settings.tenantId, settings.key],
          set: row,
        });
    }
    // Every key written or deleted, even when the effective value stayed: a
    // pinned value is a real change, env can move later.
    return (Object.keys(changes) as SettingKey[]).map((key) => ({
      key,
      old: describeSetting(key, before).value,
      new: describeSetting(key, after).value,
    }));
  });
  await refreshSettings();
  return changed;
}
