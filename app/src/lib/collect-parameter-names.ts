import type { DashboardLayoutV2, ClickAction, DashboardWidget } from "./db/schema";

const PARAM_REGEX = /\$param_(\w+)/g;

export interface ParameterCollision {
  widgetId: string;
  title: string;
}

export function getWidgetParameterNames(widget: DashboardWidget): string[] {
  const names: string[] = [];
  const clickAction = widget.settings?.clickAction as ClickAction | undefined;

  // Click action top-level parameterMapping
  if (clickAction?.parameterMapping?.parameterName) {
    names.push(clickAction.parameterMapping.parameterName);
  }

  // Click action rules[]
  if (clickAction?.rules) {
    for (const rule of clickAction.rules) {
      if (rule.parameterMapping?.parameterName) {
        names.push(rule.parameterMapping.parameterName);
      }
    }
  }

  // Param-select chartOptions.parameterName
  if (widget.chartType === "parameter-select") {
    const opts = widget.settings?.chartOptions as Record<string, unknown> | undefined;
    if (opts?.parameterName && typeof opts.parameterName === "string") {
      names.push(opts.parameterName);
    }
  }

  return names;
}

/**
 * Scans a dashboard layout for all parameter names referenced across:
 * 1. Click action `parameterMapping.parameterName` values
 * 2. Click action `rules[].parameterMapping.parameterName` values
 * 3. `$param_xxx` references in widget queries
 * 4. Param-select widget `parameterName` in chartOptions
 *
 * Returns a deduplicated, sorted array of parameter names.
 */
export function collectParameterNames(layout: DashboardLayoutV2): string[] {
  const names = new Set<string>();

  for (const page of layout.pages) {
    for (const widget of page.widgets) {
      for (const name of getWidgetParameterNames(widget)) {
        names.add(name);
      }

      // $param_xxx in queries
      if (widget.query) {
        let match: RegExpExecArray | null;
        PARAM_REGEX.lastIndex = 0;
        while ((match = PARAM_REGEX.exec(widget.query)) !== null) {
          names.add(match[1]);
        }
      }
    }
  }

  return [...names].sort();
}

/**
 * Finds all widgets (excluding `currentWidgetId`) that already use `parameterName`
 * as a setter (param-select or click action). Returns their ID and display title.
 *
 * Returns an empty array when `parameterName` is empty.
 */
export function findParameterCollisions(
  layout: DashboardLayoutV2,
  currentWidgetId: string,
  parameterName: string
): ParameterCollision[] {
  if (!parameterName) return [];

  const collisions: ParameterCollision[] = [];

  for (const page of layout.pages) {
    for (const widget of page.widgets) {
      if (widget.id === currentWidgetId) continue;
      if (getWidgetParameterNames(widget).includes(parameterName)) {
        const titleSetting = widget.settings?.title;
        const title =
          titleSetting && typeof titleSetting === "string"
            ? titleSetting
            : widget.chartType;
        collisions.push({ widgetId: widget.id, title });
      }
    }
  }

  return collisions;
}

/**
 * Aggregates all parameter names from a click action configuration.
 * Collects from the top-level `parameterName` and from all `rules[].parameterMapping.parameterName`.
 * Returns a deduplicated array.
 */
export function aggregateClickActionParamNames(
  clickActionEnabled: boolean,
  parameterName: string,
  actionRules: ReadonlyArray<{ parameterMapping?: { parameterName?: string } }>,
): string[] {
  if (!clickActionEnabled) return [];
  const names: string[] = [];
  if (parameterName.trim()) names.push(parameterName.trim());
  for (const rule of actionRules) {
    if (rule.parameterMapping?.parameterName) {
      names.push(rule.parameterMapping.parameterName);
    }
  }
  return [...new Set(names)];
}
