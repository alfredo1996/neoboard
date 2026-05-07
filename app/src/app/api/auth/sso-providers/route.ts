import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { ssoProviders } from "@/lib/db/schema";
import { apiSuccess } from "@/lib/api/api-response";
import { handleRouteError } from "@/lib/api/api-utils";

/**
 * Public endpoint — returns only id + name of enabled SSO providers.
 * Used by the login page to render SSO buttons.
 * No auth required (falls under /api/auth/ public prefix).
 */
export async function GET() {
  try {
    const tenantId = process.env.TENANT_ID ?? "default";

    const rows = await db
      .select({
        id: ssoProviders.id,
        name: ssoProviders.name,
      })
      .from(ssoProviders)
      .where(
        and(
          eq(ssoProviders.tenantId, tenantId),
          eq(ssoProviders.enabled, true),
        ),
      );

    return apiSuccess(rows);
  } catch (e) {
    return handleRouteError(e);
  }
}
