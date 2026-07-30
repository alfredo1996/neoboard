/**
 * What to offer the user after an import left widgets without a connection
 * (#1377).
 *
 * The import already knows how big a job it just created, so it should hand
 * back a remedy rather than "assign one in the widget editor" 43 times. The one
 * case where it cannot is a mix of connector types: a single target connection
 * cannot be right for a Cypher widget and a SQL widget at once, so the
 * per-widget note stands.
 */
export type ImportFollowUp =
  | { kind: "none" }
  | { kind: "bulk"; count: number }
  | { kind: "manual"; count: number };

export function importFollowUp(
  unassignedWidgetCount: number,
  /** Connector type of each skipped connection; `undefined` when unknown. */
  skippedConnectorTypes: ReadonlyArray<string | undefined>,
): ImportFollowUp {
  if (unassignedWidgetCount <= 0) return { kind: "none" };
  // An unknown type counts as its own value: mixing "neo4j" with something
  // unidentified is not safe to bulk-assign either.
  return new Set(skippedConnectorTypes).size > 1
    ? { kind: "manual", count: unassignedWidgetCount }
    : { kind: "bulk", count: unassignedWidgetCount };
}
