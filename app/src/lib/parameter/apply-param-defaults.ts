import type { DashboardLayoutV2 } from "@/lib/db/schema";

/**
 * Extract default parameter values from parameter-select widgets in the layout.
 * Returns a map of parameterName → defaultValue for widgets that have a non-empty default.
 */
export function extractParamDefaults(
  layout: DashboardLayoutV2,
): Record<string, string> {
  const defaults: Record<string, string> = {};
  for (const page of layout.pages) {
    for (const widget of page.widgets) {
      if (widget.chartType !== "parameter-select") continue;
      const opts = (widget.settings?.chartOptions ?? {}) as Record<
        string,
        unknown
      >;
      const paramName = opts.parameterName as string | undefined;
      const defaultValue = opts.defaultValue as string | undefined;
      if (paramName && defaultValue) {
        defaults[paramName] = defaultValue;
      }
    }
  }
  return defaults;
}
