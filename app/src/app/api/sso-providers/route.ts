import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { ssoProviders } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { encrypt } from "@/lib/crypto/crypto";
import { validateBody, handleRouteError, forbidden } from "@/lib/api/api-utils";
import { apiSuccess, apiError } from "@/lib/api/api-response";
import { invalidateProviderCache } from "@/lib/auth/sso/provider-cache";

const MAX_PROVIDERS_PER_TENANT = 5;

/** SSO management requires NEOBOARD_EDITION=enterprise. */
function requireEnterprise() {
  if (process.env.NEOBOARD_EDITION !== "enterprise") {
    return forbidden("SSO requires NEOBOARD_EDITION=enterprise");
  }
  return null;
}

const claimMappingSchema = z.object({
  claimKey: z.string().min(1),
  adminValue: z.string().optional(),
  creatorValue: z.string().optional(),
  readerValue: z.string().optional(),
});

const createProviderSchema = z.object({
  name: z.string().min(1),
  issuer: z.string().url(),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  scopes: z.string().optional().default("openid profile email"),
  claimMappings: claimMappingSchema.optional(),
  autoProvision: z.boolean().optional().default(true),
  defaultRole: z
    .enum(["admin", "creator", "reader"])
    .optional()
    .default("creator"),
  enforceSso: z.boolean().optional().default(false),
});

const updateProviderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  clientId: z.string().min(1).optional(),
  clientSecret: z.string().min(1).optional(),
  scopes: z.string().optional(),
  claimMappings: claimMappingSchema.nullable().optional(),
  autoProvision: z.boolean().optional(),
  defaultRole: z.enum(["admin", "creator", "reader"]).optional(),
  enforceSso: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

export async function GET() {
  const gate = requireEnterprise();
  if (gate) return gate;
  try {
    const { tenantId } = await requireAdmin();

    const rows = await db
      .select({
        id: ssoProviders.id,
        name: ssoProviders.name,
        protocol: ssoProviders.protocol,
        issuer: ssoProviders.issuer,
        clientId: ssoProviders.clientId,
        scopes: ssoProviders.scopes,
        claimMappings: ssoProviders.claimMappings,
        autoProvision: ssoProviders.autoProvision,
        defaultRole: ssoProviders.defaultRole,
        enforceSso: ssoProviders.enforceSso,
        enabled: ssoProviders.enabled,
        createdAt: ssoProviders.createdAt,
        updatedAt: ssoProviders.updatedAt,
      })
      .from(ssoProviders)
      .where(eq(ssoProviders.tenantId, tenantId));

    return apiSuccess(rows);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(request: Request) {
  const gate = requireEnterprise();
  if (gate) return gate;
  try {
    const { tenantId } = await requireAdmin();

    const body = await request.json();
    const result = validateBody(createProviderSchema, body);
    if (!result.success) return result.response;

    const {
      name,
      issuer,
      clientId,
      clientSecret,
      scopes,
      claimMappings,
      autoProvision,
      defaultRole,
      enforceSso,
    } = result.data;

    // Check max providers limit before insert to give a clear error message.
    // The unique constraint on (tenantId, issuer) handles duplicate detection atomically.
    const providerCount = await db
      .select({ id: ssoProviders.id })
      .from(ssoProviders)
      .where(eq(ssoProviders.tenantId, tenantId));

    if (providerCount.length >= MAX_PROVIDERS_PER_TENANT) {
      return apiError(
        "CONFLICT",
        "Maximum of " +
          String(MAX_PROVIDERS_PER_TENANT) +
          " SSO providers per tenant",
      );
    }

    try {
      const [provider] = await db
        .insert(ssoProviders)
        .values({
          tenantId,
          name,
          issuer,
          clientId,
          clientSecretEncrypted: encrypt(clientSecret),
          scopes,
          claimMappings: claimMappings ?? null,
          autoProvision,
          defaultRole,
          enforceSso,
        })
        .returning({
          id: ssoProviders.id,
          name: ssoProviders.name,
          protocol: ssoProviders.protocol,
          issuer: ssoProviders.issuer,
          clientId: ssoProviders.clientId,
          scopes: ssoProviders.scopes,
          claimMappings: ssoProviders.claimMappings,
          autoProvision: ssoProviders.autoProvision,
          defaultRole: ssoProviders.defaultRole,
          enforceSso: ssoProviders.enforceSso,
          enabled: ssoProviders.enabled,
          createdAt: ssoProviders.createdAt,
          updatedAt: ssoProviders.updatedAt,
        });

      invalidateProviderCache(tenantId);
      return apiSuccess(provider, 201);
    } catch (err: unknown) {
      // Unique constraint violation on (tenantId, issuer) — duplicate provider
      if (
        err instanceof Error &&
        err.message.includes("sso_provider_tenant_issuer_unique")
      ) {
        return apiError(
          "CONFLICT",
          "An SSO provider with this issuer already exists",
        );
      }
      throw err;
    }
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function DELETE(request: Request) {
  const gate = requireEnterprise();
  if (gate) return gate;
  try {
    const { tenantId } = await requireAdmin();

    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return apiError("BAD_REQUEST", "Missing required query parameter: id");
    }

    const deleted = await db
      .delete(ssoProviders)
      .where(and(eq(ssoProviders.id, id), eq(ssoProviders.tenantId, tenantId)))
      .returning({ id: ssoProviders.id, name: ssoProviders.name });

    if (deleted.length === 0) {
      return apiError("NOT_FOUND", "SSO provider not found");
    }

    invalidateProviderCache(tenantId);
    return apiSuccess(deleted[0]);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function PATCH(request: Request) {
  const gate = requireEnterprise();
  if (gate) return gate;
  try {
    const { tenantId } = await requireAdmin();

    const body = await request.json();
    const result = validateBody(updateProviderSchema, body);
    if (!result.success) return result.response;

    const { id, clientSecret, ...fields } = result.data;

    // Build the update set — only include fields that were provided
    const updateSet: Record<string, unknown> = { updatedAt: new Date() };
    if (fields.name !== undefined) updateSet.name = fields.name;
    if (fields.clientId !== undefined) updateSet.clientId = fields.clientId;
    if (fields.scopes !== undefined) updateSet.scopes = fields.scopes;
    if (fields.claimMappings !== undefined)
      updateSet.claimMappings = fields.claimMappings;
    if (fields.autoProvision !== undefined)
      updateSet.autoProvision = fields.autoProvision;
    if (fields.defaultRole !== undefined)
      updateSet.defaultRole = fields.defaultRole;
    if (fields.enforceSso !== undefined)
      updateSet.enforceSso = fields.enforceSso;
    if (fields.enabled !== undefined) updateSet.enabled = fields.enabled;
    if (clientSecret !== undefined)
      updateSet.clientSecretEncrypted = encrypt(clientSecret);

    const [updated] = await db
      .update(ssoProviders)
      .set(updateSet)
      .where(and(eq(ssoProviders.id, id), eq(ssoProviders.tenantId, tenantId)))
      .returning({
        id: ssoProviders.id,
        name: ssoProviders.name,
        protocol: ssoProviders.protocol,
        issuer: ssoProviders.issuer,
        clientId: ssoProviders.clientId,
        scopes: ssoProviders.scopes,
        claimMappings: ssoProviders.claimMappings,
        autoProvision: ssoProviders.autoProvision,
        defaultRole: ssoProviders.defaultRole,
        enforceSso: ssoProviders.enforceSso,
        enabled: ssoProviders.enabled,
        updatedAt: ssoProviders.updatedAt,
      });

    if (!updated) {
      return apiError("NOT_FOUND", "SSO provider not found");
    }

    invalidateProviderCache(tenantId);
    return apiSuccess(updated);
  } catch (e) {
    return handleRouteError(e);
  }
}
