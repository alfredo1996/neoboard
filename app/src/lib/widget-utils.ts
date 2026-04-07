import { getChartConfig } from "@/lib/chart-helpers";
import type { DashboardWidget } from "@/lib/db/schema";

/**
 * Get display title for a widget (settings title or chart type label).
 */
export function getWidgetDisplayTitle(widget: DashboardWidget): string {
  const title = (widget.settings ?? {}).title;
  if (title && typeof title === "string") return title;
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
