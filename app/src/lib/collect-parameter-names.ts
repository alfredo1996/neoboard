import type { DashboardLayoutV2, ClickAction } from "./db/schema";

const PARAM_REGEX = /\$param_(\w+)/g;

/**
 * Scans a dashboard layout for all parameter names referenced across:
 * 1. Click action `parameterMapping.parameterName` values
 * 2. `$param_xxx` references in widget queries
 * 3. Param-select widget `parameterName` in chartOptions
 *
 * Returns a deduplicated, sorted array of parameter names.
 */
export function collectParameterNames(layout: DashboardLayoutV2): string[] {
  const names = new Set<string>();

  for (const page of layout.pages) {
    for (const widget of page.widgets) {
      // 1. Click action parameterMapping
      const clickAction = widget.settings?.clickAction as ClickAction | undefined;
      if (clickAction?.parameterMapping?.parameterName) {
        names.add(clickAction.parameterMapping.parameterName);
      }

      // 2. $param_xxx in queries
      if (widget.query) {
        let match: RegExpExecArray | null;
        PARAM_REGEX.lastIndex = 0;
        while ((match = PARAM_REGEX.exec(widget.query)) !== null) {
          names.add(match[1]);
        }
      }

      // 3. Param-select widget parameterName in chartOptions
      if (widget.chartType === "parameter-select") {
        const opts = widget.settings?.chartOptions as Record<string, unknown> | undefined;
        if (opts?.parameterName && typeof opts.parameterName === "string") {
          names.add(opts.parameterName);
        }
      }
    }
  }

  return [...names].sort();
}
