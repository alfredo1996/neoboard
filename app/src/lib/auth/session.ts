import { auth } from "./config";
import type { UserRole } from "@/lib/db/schema";

/**
 * Require the current user to be an admin.
 * Throws if not authenticated or not admin.
 */
export async function requireAdmin(): Promise<{
  userId: string;
  tenantId: string;
}> {
  const { userId, role, tenantId } = await requireSession();
  if (role !== "admin") {
    throw new Error("Forbidden");
  }
  return { userId, tenantId };
}

/**
 * Get the current authenticated user's session.
 * Returns null if not authenticated.
 */
export async function getSession() {
  return auth();
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user = session.user as any;
  const role = (user.role as UserRole) ?? "creator";
  // tenantId is stamped into the JWT at sign-in time from TENANT_ID env var.
  // Fall back to env var as a safety net (e.g. tokens issued before this field existed).
  const tenantId: string = user.tenantId ?? process.env.TENANT_ID ?? "default";
  return {
    userId: session.user.id,
    role,
    canWrite: role !== "reader",
    tenantId,
  };
}
