import { getChartConfig } from "@/lib/plugin/chart-helpers";
import { isContentOnlyChartType } from "@/lib/widget/content-only-chart";
import type { DashboardWidget } from "@/lib/db/schema";

/**
 * Get display title for a widget (settings title or chart type label).
 *
 * The chart-label fallback earns its place on a data widget: an untitled bar
 * chart headed "Bar Chart" tells the reader what they are looking at. On a
 * content widget it does the opposite — markdown and iframe widgets are prose
 * and embeds, where the content already carries its own heading, so the
 * fallback only announced the implementation type. 70 of the 78 markdown
 * widgets in the shipped demo rendered a card header reading "Markdown"
 * (#1519).
 *
 * Returning "" rather than undefined keeps the signature a plain string;
 * `WidgetCard` renders no `h3` for an empty title while still showing the
 * card's action affordances.
 */
export function getWidgetDisplayTitle(widget: DashboardWidget): string {
  const title = (widget.settings ?? {}).title;
  // Trimmed: a whitespace-only title is not a title, and rendered as a blank
  // header occupying space with nothing in it.
  if (typeof title === "string" && title.trim()) return title;
  if (isContentOnlyChartType(widget.chartType)) return "";
  return getChartConfig(widget.chartType)?.label ?? widget.chartType;
}

/**
 * Check if a widget's template has been updated since last sync.
 */
export function isWidgetTemplateOutdated(
  widget: DashboardWidget,
  templateMap?: Record<string, { updatedAt?: string | Date | null }>,
): boolean {
  if (!widget.templateId || !widget.templateSyncedAt) return false;
  const tmpl = templateMap?.[widget.templateId];
  if (!tmpl?.updatedAt) return false;
  return new Date(tmpl.updatedAt) > new Date(widget.templateSyncedAt);
}
