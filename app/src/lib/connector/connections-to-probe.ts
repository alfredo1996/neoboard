/**
 * Which connections the Connections page may probe: what "Test all" tests
 * (#1426), and the same rule the page applies to a row's Test action.
 *
 * #1545: the page used to test every connection the list route returned,
 * including tenant-shared ones the user does not own. `/api/connections/[id]/test`
 * filters on ownership and 404s for those, and the resulting error envelope
 * painted a red "Connection test failed" badge over a perfectly healthy
 * connection.
 */
export function connectionsToProbe<T extends { isOwner?: boolean }>(
  connections: T[],
  isAdmin: boolean,
): T[] {
  return connections.filter((c) => c.isOwner || isAdmin);
}
