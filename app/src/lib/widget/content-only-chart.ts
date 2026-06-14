/**
 * Content-only widgets (Markdown, iframe) don't query a database, so they have
 * no meaningful connector or query. Centralized so the editor and the Widget
 * Lab card agree on what "content-only" means (#1053).
 */
const CONTENT_ONLY_CHART_TYPES = new Set(["markdown", "iframe"]);

export function isContentOnlyChartType(chartType: string): boolean {
  return CONTENT_ONLY_CHART_TYPES.has(chartType);
}
