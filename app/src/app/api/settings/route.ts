import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { apiSuccess, apiError } from "@/lib/api/api-response";
import {
  handleRouteError,
  readJsonBody,
  validateBody,
} from "@/lib/api/api-utils";
import { auditRequest } from "@/lib/audit/audit";
import {
  SETTING_KEYS,
  describeSetting,
  validateChanges,
  type SettingKey,
} from "@/lib/settings/core";
import { refreshSettings, saveSettings } from "@/lib/settings/store";

/** Each key's value, where it comes from and who last set it. */
function snapshot() {
  const settings = Object.fromEntries(
    SETTING_KEYS.map((key) => [key, describeSetting(key)]),
  );
  // Read-only here: a live change would let #2138's revocation rows, sized
  // for the old age, expire while a re-issued session lives on.
  const fromEnv = Boolean(process.env.SESSION_MAX_AGE);
  const sessionMaxAge = {
    seconds: Number.parseInt(process.env.SESSION_MAX_AGE || "28800", 10),
    source: fromEnv ? "env" : "default",
  };
  return { settings, sessionMaxAge };
}

const putSchema = z.object({ changes: z.record(z.string(), z.unknown()) });

/** GET /api/settings. Admin only. */
export async function GET() {
  try {
    const { tenantId } = await requireAdmin();
    await refreshSettings(tenantId);
    return apiSuccess(snapshot());
  } catch (e) {
    return handleRouteError(e);
  }
}

/**
 * PUT /api/settings  { changes: { KEY: value | null } }. Admin only.
 * `null` resets a key to env or the default. Unknown and locked keys, and any
 * value out of range, answer 400 and nothing is written.
 */
export async function PUT(request: Request) {
  try {
    const { userId, tenantId } = await requireAdmin();
    const parsed = validateBody(putSchema, await readJsonBody(request));
    if (!parsed.success) return parsed.response;

    const { changes } = parsed.data;
    await refreshSettings(tenantId);
    const problem = validateChanges(changes);
    if (problem) return apiError("VALIDATION_ERROR", problem);

    const changed = await saveSettings(
      tenantId,
      userId,
      changes as Partial<Record<SettingKey, unknown>>,
    );
    for (const c of changed) {
      auditRequest(request, {
        tenantId,
        userId,
        action: "settings.update",
        resourceType: "setting",
        resourceId: c.key,
        details: { key: c.key, old: c.old, new: c.new },
      });
    }
    return apiSuccess(snapshot());
  } catch (e) {
    return handleRouteError(e);
  }
}
