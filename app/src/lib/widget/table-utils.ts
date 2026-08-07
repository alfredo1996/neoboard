/**
 * Parses the widget's `groupBy` setting into an array of column IDs.
 * Returns undefined if grouping is disabled or no valid columns are provided.
 *
 * Accepts **both** shapes, because both occur in the wild (#1395):
 *
 * - a comma-separated string — what the widget editor writes, since the
 *   `column-multi-select` control emits `vals.join(",")`
 * - an array of column ids — what seeded layouts, imported dashboards and
 *   NeoDash conversions carry
 *
 * It previously accepted only the string, and `typeof groupBy === "string" ?
 * groupBy : ""` turned an array into an empty string. Grouping was then dropped
 * with no group rows, no aggregates and no error — so individual rows read as
 * group totals, a wrong answer the user had every reason to believe. Three
 * seeded Chart Reference tiles hold `groupBy: ["region"]` and rendered flat.
 *
 * Order is significant: it is the nesting hierarchy.
 */
export function parseGroupByColumns(
  enableGrouping: boolean,
  groupBy: string | string[],
): string[] | undefined {
  if (!enableGrouping) return undefined;

  const parts =
    typeof groupBy === "string"
      ? groupBy.split(",")
      : Array.isArray(groupBy)
        ? // Non-string entries are dropped rather than stringified: a stray
          // number would otherwise become a column id matching nothing.
          groupBy.filter((c): c is string => typeof c === "string")
        : [];

  const columns = parts.map((s) => s.trim()).filter(Boolean);
  return columns.length ? columns : undefined;
}
