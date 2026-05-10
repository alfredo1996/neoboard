import type { LoadedSsoProvider } from "./provider-loader";
import type { UserRole } from "@/lib/db/schema";

/**
 * Load a single OIDC provider from environment variables.
 * Returns null if:
 * - NEOBOARD_EDITION is not "enterprise"
 * - Any of OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET is missing
 *
 * SSO is an enterprise feature — both env-based and UI-based providers
 * require the enterprise edition.
 */
export function loadEnvSsoProvider(): LoadedSsoProvider | null {
  if (process.env.NEOBOARD_EDITION !== "enterprise") {
    return null;
  }

  const issuer = process.env.OIDC_ISSUER;
  const clientId = process.env.OIDC_CLIENT_ID;
  const clientSecret = process.env.OIDC_CLIENT_SECRET;

  if (!issuer || !clientId || !clientSecret) {
    return null;
  }

  const claimKey = process.env.OIDC_CLAIM_KEY;

  const validRoles: UserRole[] = ["admin", "creator", "reader"];
  const rawDefaultRole = process.env.OIDC_DEFAULT_ROLE;
  const defaultRole: UserRole =
    rawDefaultRole && validRoles.includes(rawDefaultRole as UserRole)
      ? (rawDefaultRole as UserRole)
      : "creator";

  return {
    id: "sso-env-oidc",
    name: process.env.OIDC_DISPLAY_NAME || "SSO",
    type: "oidc",
    issuer,
    clientId,
    clientSecret,
    authorization: {
      params: { scope: process.env.OIDC_SCOPES || "openid profile email" },
    },
    allowDangerousEmailAccountLinking: true,
    metadata: {
      claimMappings: claimKey
        ? {
            claimKey,
            adminValue: process.env.OIDC_ADMIN_VALUE,
            creatorValue: process.env.OIDC_CREATOR_VALUE,
            readerValue: process.env.OIDC_READER_VALUE,
          }
        : null,
      autoProvision: process.env.OIDC_AUTO_PROVISION !== "false",
      defaultRole,
      enforceSso: process.env.OIDC_ENFORCE_SSO === "true",
    },
  };
}
