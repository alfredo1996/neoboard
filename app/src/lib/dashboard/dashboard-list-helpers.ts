/**
 * Pure helpers for the dashboards list page (#1048).
 *
 * Kept out of the page component so the search/filter and duplicate-name
 * logic is unit-testable without rendering the (large) list page.
 */

/** Case-insensitive, trimmed name-substring filter. Empty query ⇒ all items. */
export function filterDashboardsByName<T extends { name: string }>(
  dashboards: T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return dashboards;
  return dashboards.filter((d) => d.name.toLowerCase().includes(q));
}

/**
 * True when `name` (trimmed, case-insensitive) already exists in the list.
 * Used to warn — not block — on duplicate dashboard names at create time.
 */
export function isDuplicateDashboardName(
  name: string,
  existing: ReadonlyArray<{ name: string }>,
): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return false;
  return existing.some((d) => d.name.trim().toLowerCase() === n);
}
