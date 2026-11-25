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

/** Read the tenant's rows and make them the cache. One query. */
export async function refreshSettings(
  tenantId: string = resolveTenantId(),
): Promise<void> {
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
  applySettingRows(rows);
}

/**
 * Load now, then every 30 s so other replicas pick a change up. Idempotent.
 * A failed load keeps the last cache (env and defaults before the first one).
 */
export function startSettingsRefresh(onError?: (err: unknown) => void): void {
  if (state.timer) return;
  const tick = () => refreshSettings().catch((err) => onError?.(err));
  state.timer = setInterval(tick, SETTINGS_TTL_MS);
  (state.timer as { unref?: () => void }).unref?.();
  tick();
}

export interface SettingChange {
  key: SettingKey;
  old: unknown;
  new: unknown;
}

/**
 * Write `changes` (`null` deletes the row, so the key falls back to env or the
 * default), reload the cache so this process applies it at once, and return
 * what changed in effective value, for the audit trail.
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
  return (Object.keys(changes) as SettingKey[])
    .map((key) => ({ key, old: before.get(key), new: getSetting(key) }))
    .filter((c) => c.old !== c.new);
}
