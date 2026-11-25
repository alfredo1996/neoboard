import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { settings, users } from "@/lib/db/schema";
import { resolveTenantId } from "@/lib/auth/tenant-id";
import {
  SETTING_KEYS,
  applySettingRows,
  getSetting,
  state,
  type SettingKey,
} from "./core";

/** How long another replica can run on a stale value after an admin saves. */
export const SETTINGS_TTL_MS = 30_000;

// Sequence numbers: a SELECT that started before a write committed can finish
// after the write's own refresh; only the newest start may land.
const seq = { started: 0, applied: 0 };

/** Read the tenant's rows and make them the cache. One query. */
export async function refreshSettings(
  tenantId: string = resolveTenantId(),
): Promise<void> {
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
 */
export async function saveSettings(
  tenantId: string,
  userId: string,
  changes: Partial<Record<SettingKey, unknown>>,
): Promise<SettingChange[]> {
  const before = new Map(SETTING_KEYS.map((k) => [k, getSetting(k)]));
  await db.transaction(async (tx) => {
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) {
        await tx
          .delete(settings)
          .where(and(eq(settings.tenantId, tenantId), eq(settings.key, key)));
        continue;
      }
      const row = { value, updatedBy: userId, updatedAt: new Date() };
      await tx
        .insert(settings)
        .values({ tenantId, key, ...row })
        .onConflictDoUpdate({
          target: [settings.tenantId, settings.key],
          set: row,
        });
    }
  });
  await refreshSettings(tenantId);
  // Every key written or deleted, even when the effective value stayed: a
  // pinned value is a real change, env can move later.
  return (Object.keys(changes) as SettingKey[]).map((key) => ({
    key,
    old: before.get(key),
    new: getSetting(key),
  }));
}
