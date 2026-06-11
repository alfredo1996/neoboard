/**
 * Dashboard query binding (#972).
 *
 * A viewer of a shared/public dashboard gets query access to that
 * dashboard's connection — but only for the queries the dashboard actually
 * contains. Widget clients send their stored query templates verbatim
 * (parameter values travel separately through native driver binding), so
 * binding is a normalized exact-match against the saved layout, not a
 * fuzzy/wildcard comparison.
 *
 * Edit-level users (dashboard owner, editor shares, connection owners,
 * admins) are NOT bound — authoring widgets requires running novel queries.
 */

interface LayoutWidget {
  query?: unknown;
  settings?: Record<string, unknown>;
}

interface LayoutPage {
  widgets?: LayoutWidget[];
}

interface Layout {
  pages?: LayoutPage[];
}

/** Collapse internal whitespace and trim. Case-sensitive by design. */
export function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ");
}

/**
 * Every query string a dashboard can legitimately execute: widget queries
 * plus parameter-select seed queries, across all pages. Normalized.
 */
export function collectLayoutQueries(layout: unknown): Set<string> {
  const queries = new Set<string>();
  const pages = (layout as Layout | null)?.pages;
  if (!Array.isArray(pages)) return queries;
  for (const page of pages) {
    if (!Array.isArray(page?.widgets)) continue;
    for (const widget of page.widgets) {
      if (typeof widget?.query === "string" && widget.query.trim()) {
        queries.add(normalizeQuery(widget.query));
      }
      const seed = widget?.settings?.seedQuery;
      if (typeof seed === "string" && seed.trim()) {
        queries.add(normalizeQuery(seed));
      }
    }
  }
  return queries;
}

/** True when the submitted query appears in at least one of the layouts. */
export function layoutsAllowQuery(layouts: unknown[], query: string): boolean {
  const normalized = normalizeQuery(query);
  return layouts.some((layout) => collectLayoutQueries(layout).has(normalized));
}
