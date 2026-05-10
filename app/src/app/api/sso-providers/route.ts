import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { ssoProviders } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { encrypt } from "@/lib/crypto/crypto";
import { validateBody, handleRouteError } from "@/lib/api/api-utils";
import { apiSuccess, apiError } from "@/lib/api/api-response";

const MAX_PROVIDERS_PER_TENANT = 5;

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

export async function GET() {
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

    return apiSuccess(deleted[0]);
  } catch (e) {
    return handleRouteError(e);
  }
}
