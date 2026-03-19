import { auth } from "./config";
import { resolveApiKeyAuth } from "./api-key";
import type { UserRole } from "@/lib/db/schema";
import { UnauthorizedError, ForbiddenError } from "./errors";

/**
 * Require the current user to be an admin.
 * Throws if not authenticated, not admin, or not allowed to write.
 */
export async function requireAdmin(): Promise<{
  userId: string;
  canWrite: boolean;
  tenantId: string;
}> {
  const { userId, role, canWrite, tenantId } = await requireSession();
  if (role !== "admin") {
    throw new ForbiddenError();
  }
  return { userId, canWrite, tenantId };
}
/**
 * Get the current authenticated user ID.
 * Tries API key auth first; falls back to session-based auth.
 * Throws if not authenticated (use in protected API routes).
 */
export async function requireUserId(): Promise<string> {
  const apiKeyAuth = await resolveApiKeyAuth();
  if (apiKeyAuth) return apiKeyAuth.userId;

  const session = await auth();
  if (!session?.user?.id) {
    throw new UnauthorizedError();
  }
  return session.user.id;
}

/**
 * Get the current authenticated user's ID and system role.
 * Tries API key auth first; falls back to session-based auth.
 * Throws if not authenticated.
 */
export async function requireSession(): Promise<{
  userId: string;
  role: UserRole;
  canWrite: boolean;
  tenantId: string;
}> {
  // Try API key auth first (returns null if no nb_-prefixed Bearer header)
  const apiKeyAuth = await resolveApiKeyAuth();
  if (apiKeyAuth) return apiKeyAuth;

  // Fall back to session-based auth
  const session = await auth();
  if (!session?.user?.id) {
    throw new UnauthorizedError();
  }
  const role = session.user.role ?? "creator";
  // tenantId is stamped into the JWT at sign-in time from TENANT_ID env var.
  // Fall back to env var as a safety net (e.g. tokens issued before this field existed).
  const tenantId: string = session.user.tenantId ?? process.env.TENANT_ID ?? "default";
  return {
    userId: session.user.id,
    role,
    // Admins always write; readers never write; others read from JWT (DB-backed), defaulting true for old tokens
    canWrite: role === "admin" ? true : role !== "reader" && (session.user.canWrite !== false),
    tenantId,
  };
}
