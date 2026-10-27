/**
 * Effective write permission, shared by the server and the client gates so
 * they cannot drift (#2313). Admins always write; readers never; others follow
 * their flag, defaulting to true for tokens issued before the flag existed.
 * Client-safe: imports nothing.
 */
export function effectiveCanWrite(
  role: string | undefined,
  flag: boolean | null | undefined,
): boolean {
  if (role === "admin") return true;
  if (role === "reader") return false;
  return flag !== false;
}
