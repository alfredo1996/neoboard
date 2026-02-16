import { auth } from "./config";

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
