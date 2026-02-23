import { auth } from "./config";
import type { UserRole } from "@/lib/db/schema";

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
}> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const role = ((session.user as any).role as UserRole) ?? "creator";
  return { userId: session.user.id, role };
}
