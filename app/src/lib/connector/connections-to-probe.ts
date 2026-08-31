/**
 * Which connections the Connections page's on-mount sweep may probe.
 *
 * #1545: the sweep used to test every connection the list route returned,
 * including tenant-shared ones the user does not own. `/api/connections/[id]/test`
 * filters on ownership and 404s for those, and the resulting error envelope
 * painted a red "Connection test failed" badge over a perfectly healthy
 * connection.
 *
 * This is the same rule the page already applies to the manual Test action —
 * it is extracted so it can be tested, since the sweep itself lives inside a
 * useEffect that unit tests cannot reach.
 */
export function connectionsToProbe<T extends { isOwner?: boolean }>(
  connections: T[],
  isAdmin: boolean,
): T[] {
  return connections.filter((c) => c.isOwner || isAdmin);
}
