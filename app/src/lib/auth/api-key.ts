import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiKeys, users } from "@/lib/db/schema";
import type { UserRole } from "@/lib/db/schema";

/**
 * Server-side secret for HMAC-SHA256 key hashing.
 * Requires a dedicated API_KEY_HMAC_SECRET — never shares the ENCRYPTION_KEY
 * to prevent key rotation from invalidating all API key hashes.
 */
function getHmacSecret(): string {
  const secret = process.env.API_KEY_HMAC_SECRET;
  if (!secret) throw new Error("API_KEY_HMAC_SECRET must be set");
  return secret;
}

/** Generate a new API key. Returns { plaintext, hash }. */
export function generateApiKey(): { plaintext: string; hash: string } {
  const plaintext = "nb_" + randomBytes(32).toString("hex");
  const hash = hashApiKey(plaintext);
  return { plaintext, hash };
}

/** Hash a plaintext API key with HMAC-SHA256 using a server-side secret. */
export function hashApiKey(plaintext: string): string {
  return createHmac("sha256", getHmacSecret()).update(plaintext).digest("hex");
}

/**
 * Resolve an API key from the Authorization header to a user context.
 * Returns null if no API key header is present or the token lacks the nb_ prefix
 * (allowing fallback to session-based auth).
 * Throws generic "Unauthorized" for any auth failure (invalid, expired, revoked)
 * to avoid information disclosure.
 */
export async function resolveApiKeyAuth(): Promise<{
  userId: string;
  role: UserRole;
  canWrite: boolean;
  tenantId: string;
} | null> {
  const headersList = await headers();
  const authHeader = headersList.get("authorization");

  if (!authHeader) return null;
  if (!authHeader.startsWith("Bearer ")) return null;

  const token = authHeader.slice("Bearer ".length);
  if (!token.startsWith("nb_")) return null;

  const keyHash = hashApiKey(token);

  const rows = await db
    .select({
      id: apiKeys.id,
      userId: apiKeys.userId,
      tenantId: apiKeys.tenantId,
      keyHash: apiKeys.keyHash,
      role: users.role,
      canWrite: users.canWrite,
      expiresAt: apiKeys.expiresAt,
    })
    .from(apiKeys)
    .innerJoin(users, eq(apiKeys.userId, users.id))
    .where(eq(apiKeys.keyHash, keyHash));

  if (rows.length === 0) {
    throw new Error("Unauthorized");
  }

  // Constant-time comparison to prevent timing attacks that could
  // distinguish valid key hashes from invalid ones via response latency.
  const storedHash = Buffer.from(rows[0].keyHash, "hex");
  const computedHash = Buffer.from(keyHash, "hex");
  if (storedHash.length !== computedHash.length || !timingSafeEqual(storedHash, computedHash)) {
    throw new Error("Unauthorized");
  }

  const row = rows[0];

  if (row.expiresAt && row.expiresAt < new Date()) {
    throw new Error("Unauthorized");
  }

  // Fire-and-forget lastUsedAt update — failure is acceptable (audit trail, not security)
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(and(eq(apiKeys.id, row.id), eq(apiKeys.tenantId, row.tenantId)))
    .catch((err: unknown) => {
      console.warn("[api-key] Failed to update lastUsedAt:", err instanceof Error ? err.message : "unknown");
    });

  const role: UserRole = row.role;
  return {
    userId: row.userId,
    role,
    canWrite:
      role === "admin" ? true : role !== "reader" && row.canWrite,
    tenantId: row.tenantId,
  };
}
