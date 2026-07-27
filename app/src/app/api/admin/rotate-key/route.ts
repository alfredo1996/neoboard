import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { connections, ssoProviders } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { decrypt, encrypt } from "@/lib/crypto/crypto";
import { apiSuccess } from "@/lib/api/api-response";
import { badRequest, forbidden, handleRouteError } from "@/lib/api/api-utils";
import { auditRequest } from "@/lib/audit/audit";

/**
 * POST /api/admin/rotate-key
 *
 * Re-encrypts all stored credentials with the current ENCRYPTION_KEY.
 * Requires ENCRYPTION_KEY_OLD to be set so that records encrypted with the
 * previous key can be decrypted during the migration.
 *
 * Admin-only. Runs inside a transaction for atomicity.
 */
export async function POST(request: Request) {
  try {
    const { userId, role, tenantId } = await requireSession();

    if (role !== "admin") {
      return forbidden();
    }

    if (!process.env.ENCRYPTION_KEY_OLD) {
      return badRequest(
        "ENCRYPTION_KEY_OLD must be set to rotate keys. " +
          "Set it to the previous encryption key value before calling this endpoint.",
      );
    }

    const result = await db.transaction(async (tx) => {
      // ── Re-encrypt connections ──────────────────────────────────────
      const allConnections = await tx
        .select({
          id: connections.id,
          configEncrypted: connections.configEncrypted,
        })
        .from(connections);

      for (const conn of allConnections) {
        const plaintext = decrypt(conn.configEncrypted);
        const reEncrypted = encrypt(plaintext);
        await tx
          .update(connections)
          .set({ configEncrypted: reEncrypted })
          .where(eq(connections.id, conn.id));
      }

      // ── Re-encrypt SSO provider secrets ─────────────────────────────
      const allSsoProviders = await tx
        .select({
          id: ssoProviders.id,
          clientSecretEncrypted: ssoProviders.clientSecretEncrypted,
        })
        .from(ssoProviders);

      for (const provider of allSsoProviders) {
        const plaintext = decrypt(provider.clientSecretEncrypted);
        const reEncrypted = encrypt(plaintext);
        await tx
          .update(ssoProviders)
          .set({ clientSecretEncrypted: reEncrypted })
          .where(eq(ssoProviders.id, provider.id));
      }

      return {
        connections: allConnections.length,
        ssoProviders: allSsoProviders.length,
      };
    });

    auditRequest(request, {
      tenantId,
      userId,
      action: "admin.key.rotate",
      resourceType: "encryption_key",
      // Counts only — never key material or ciphertext.
      details: result,
    });

    return apiSuccess(result);
  } catch (error) {
    return handleRouteError(error, "Failed to rotate encryption keys");
  }
}
