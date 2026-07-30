/**
 * Content-only widgets (Markdown, iframe) don't query a database, so they have
 * no meaningful connector or query. Centralized so the editor and the Widget
 * Lab card agree on what "content-only" means (#1053).
 *
 * Exported as data as well as a predicate because the bulk-reassign SQL has to
 * mirror this list in a `NOT IN` clause (#1377) — one source of truth beats a
 * second hand-written copy of the type names inside a query string.
 */
export const CONTENT_ONLY_CHART_TYPES = ["markdown", "iframe"] as const;

const CONTENT_ONLY_CHART_TYPE_SET = new Set<string>(CONTENT_ONLY_CHART_TYPES);

export function isContentOnlyChartType(chartType: string): boolean {
  return CONTENT_ONLY_CHART_TYPE_SET.has(chartType);
}
