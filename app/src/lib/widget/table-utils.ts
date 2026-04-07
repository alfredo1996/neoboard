/**
 * Parses the comma-separated groupBy string into an array of column IDs.
 * Returns undefined if grouping is disabled or no valid columns are provided.
 */
export function parseGroupByColumns(
  enableGrouping: boolean,
  groupBy: string,
): string[] | undefined {
  if (!enableGrouping) return undefined;
  const raw = typeof groupBy === "string" ? groupBy : "";
  if (!raw.trim()) return undefined;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
