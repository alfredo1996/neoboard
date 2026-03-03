import { auth } from "./config";
import type { UserRole } from "@/lib/db/schema";

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
    throw new Error("Forbidden");
  }
  return { userId, canWrite, tenantId };
}
/**
 * Get the current authenticated user ID.
 * Throws if not authenticated (use in protected API routes).
 */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  return session.user.id;
}

/**
 * Get the current authenticated user's ID and system role.
 * Throws if not authenticated.
 */
export async function requireSession(): Promise<{
  userId: string;
  role: UserRole;
  canWrite: boolean;
  tenantId: string;
}> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
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
