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

/**
 * Who may manage connections (create, edit, share, delete): creators and
 * admins, never readers (#971, #1995). The server's
 * `assertCanManageConnections` and the Connections page both call this so the
 * page cannot offer what the server refuses (#2328). Role-gated, not
 * `canWrite`-gated: write permission does not cover connections (#2333).
 */
export function canManageConnections(role: string | undefined): boolean {
  return role === "admin" || role === "creator";
}
