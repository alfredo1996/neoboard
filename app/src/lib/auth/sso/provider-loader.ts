import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { ssoProviders } from "@/lib/db/schema";
import type { SsoClaimMapping, UserRole } from "@/lib/db/schema";
import { decrypt } from "@/lib/crypto/crypto";

/**
 * Metadata attached to each loaded SSO provider — used by the signIn callback
 * to resolve roles from claims and decide whether to auto-provision.
 */
export interface SsoProviderMetadata {
  claimMappings: SsoClaimMapping | null;
  autoProvision: boolean;
  defaultRole: UserRole;
  enforceSso: boolean;
}

/**
 * Auth.js-compatible OIDC provider config loaded from the database.
 * Includes NeoBoard-specific metadata for claim mapping and provisioning.
 */
export interface LoadedSsoProvider {
  id: string;
  name: string;
  type: "oidc";
  issuer: string;
  clientId: string;
  clientSecret: string;
  authorization: { params: { scope: string } };
  metadata: SsoProviderMetadata;
}

/**
 * Load all enabled SSO providers for a tenant from the database.
 * Decrypts client secrets and returns Auth.js-compatible provider configs.
 */
export async function loadSsoProviders(
  tenantId: string,
): Promise<LoadedSsoProvider[]> {
  const rows = await db
    .select({
      id: ssoProviders.id,
      name: ssoProviders.name,
      protocol: ssoProviders.protocol,
      issuer: ssoProviders.issuer,
      clientId: ssoProviders.clientId,
      clientSecretEncrypted: ssoProviders.clientSecretEncrypted,
      scopes: ssoProviders.scopes,
      claimMappings: ssoProviders.claimMappings,
      autoProvision: ssoProviders.autoProvision,
      defaultRole: ssoProviders.defaultRole,
      enforceSso: ssoProviders.enforceSso,
      enabled: ssoProviders.enabled,
    })
    .from(ssoProviders)
    .where(
      and(eq(ssoProviders.tenantId, tenantId), eq(ssoProviders.enabled, true)),
    );

  return rows.map((row) => ({
    id: "sso-" + row.id,
    name: row.name,
    type: "oidc" as const,
    issuer: row.issuer,
    clientId: row.clientId,
    clientSecret: decrypt(row.clientSecretEncrypted),
    authorization: { params: { scope: row.scopes } },
    metadata: {
      claimMappings: row.claimMappings,
      autoProvision: row.autoProvision,
      defaultRole: row.defaultRole,
      enforceSso: row.enforceSso,
    },
  }));
}
