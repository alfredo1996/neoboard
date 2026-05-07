import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { ssoProviders } from "@/lib/db/schema";
import { loadEnvSsoProvider } from "@/lib/auth/sso/env-provider";
import { apiSuccess } from "@/lib/api/api-response";
import { handleRouteError } from "@/lib/api/api-utils";

/**
 * Public endpoint — returns only id + name of enabled SSO providers.
 * Merges the env-based provider (if configured) with DB-based providers.
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
        enforceSso: ssoProviders.enforceSso,
      })
      .from(ssoProviders)
      .where(
        and(
          eq(ssoProviders.tenantId, tenantId),
          eq(ssoProviders.enabled, true),
        ),
      );

    let enforceSso = rows.some((r) => r.enforceSso);
    const providers: { id: string; name: string }[] = rows.map(
      ({ id, name }) => ({ id, name }),
    );

    // Prepend env-based provider if configured (appears first on login page)
    const envProvider = loadEnvSsoProvider();
    if (envProvider) {
      providers.unshift({
        id: envProvider.id.replace("sso-", ""),
        name: envProvider.name,
      });
      if (envProvider.metadata.enforceSso) enforceSso = true;
    }

    return apiSuccess(providers, 200, { enforceSso });
  } catch (e) {
    return handleRouteError(e);
  }
}
