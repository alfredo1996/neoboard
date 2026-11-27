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

/**
 * The tag picker's entries (#1692): every tag in use once, tags that differ
 * only in case merged under their first spelling, A to Z. `key` is the
 * lowercase form the filter compares by.
 */
export function dashboardTagOptions(
  dashboards: ReadonlyArray<{ tags?: readonly string[] }>,
): { key: string; label: string }[] {
  const byKey = new Map<string, string>();
  for (const d of dashboards) {
    for (const tag of d.tags ?? []) {
      const key = tag.toLowerCase();
      if (!byKey.has(key)) byKey.set(key, tag);
    }
  }
  return [...byKey]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Dashboards carrying the tag whose lowercase form is `key`. An empty key ⇒ all items. */
export function filterDashboardsByTag<T extends { tags?: readonly string[] }>(
  dashboards: T[],
  key: string,
): T[] {
  if (!key) return dashboards;
  return dashboards.filter((d) =>
    (d.tags ?? []).some((t) => t.toLowerCase() === key),
  );
}
