import type {
  DashboardLayoutV2,
  ClickAction,
  DashboardPage,
  DashboardWidget,
} from "@/lib/db/schema";
import { filterClearNames } from "@/lib/parameter/dashboard-filters";

const PARAM_REGEX = /\$param_(\w+)/g;

export interface ParameterCollision {
  widgetId: string;
  title: string;
}

export function getWidgetParameterNames(widget: DashboardWidget): string[] {
  const names: string[] = [];
  const ws = widget.settings ?? {};
  const clickAction = ws.clickAction as ClickAction | undefined;

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
    const opts = ws.chartOptions as Record<string, unknown> | undefined;
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

  return [...names].sort((a, b) => a.localeCompare(b));
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
  parameterName: string,
): ParameterCollision[] {
  if (!parameterName) return [];

  const collisions: ParameterCollision[] = [];

  for (const page of layout.pages) {
    for (const widget of page.widgets) {
      if (widget.id === currentWidgetId) continue;
      if (getWidgetParameterNames(widget).includes(parameterName)) {
        const titleSetting = (widget.settings ?? {}).title;
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

// ─── Parameter Source Map ─────────────────────────────────────────────

export interface ParameterSource {
  widgetId: string;
  widgetTitle: string;
  /** No title set: `widgetTitle` is the chart type standing in for one. */
  untitled?: boolean;
  pageId: string;
  pageTitle: string;
  /** Where the source's own query runs — a gated widget checks whether a
   *  sibling has found that connection dead (#1678). */
  connectionId: string;
  /** Title of the parameter-select widget that sets it: the parameter's name on the page (#2232). */
  label?: string;
}

export type ParameterSourceMap = Record<string, ParameterSource[]>;

function selectorTitle(widget: DashboardWidget): string | undefined {
  const t = widget.settings?.title;
  if (widget.chartType !== "parameter-select") return undefined;
  return typeof t === "string" && t.trim() ? t.trim() : undefined;
}

/**
 * Builds a lookup from parameter name to the widgets that SET that parameter
 * (param-select or click action). Widgets that only CONSUME params via
 * `$param_xxx` in their query are NOT included.
 *
 * Pure function, no side effects.
 */
export function buildParameterSourceMap(
  layout: DashboardLayoutV2,
): ParameterSourceMap {
  const map: ParameterSourceMap = {};

  for (const page of layout.pages) {
    for (const widget of page.widgets) {
      const paramNames = getWidgetParameterNames(widget);
      if (paramNames.length === 0) continue;

      const titleSetting = widget.settings?.title;
      const widgetTitle =
        titleSetting && typeof titleSetting === "string"
          ? titleSetting
          : widget.chartType;

      const source: ParameterSource = {
        widgetId: widget.id,
        widgetTitle,
        untitled:
          widgetTitle === widget.chartType && !titleSetting ? true : undefined,
        pageId: page.id,
        pageTitle: page.title,
        connectionId: widget.connectionId,
        label: selectorTitle(widget),
      };

      for (const name of paramNames) {
        if (!map[name]) {
          map[name] = [];
        }
        // Deduplicate: same widget can appear in paramNames multiple times
        // (e.g. top-level parameterMapping + a rule referencing the same param)
        if (!map[name].some((s) => s.widgetId === widget.id)) {
          map[name].push(source);
        }
      }
    }
  }

  return map;
}

// ─── Parameter Consumer Map (#2369) ───────────────────────────────────

/** Parameter name (as referenced: `date_from` stays `date_from`) to the ids of the page's widgets that read it. */
export type ParameterConsumerMap = Record<string, string[]>;

/**
 * Which widgets of one page read each parameter: `$param_<name>` anywhere in
 * the query or the settings (title, markdown text, URL), or a select naming it
 * as its `parentParameterName`. Pure function.
 */
export function buildParameterConsumerMap(
  page: DashboardPage,
): ParameterConsumerMap {
  const map: ParameterConsumerMap = {};
  const add = (name: string, id: string) => {
    map[name] ??= [];
    if (!map[name].includes(id)) map[name].push(id);
  };
  for (const widget of page.widgets) {
    // A searchable select's seed query reads its own search box as
    // $param_search (use-seed-query.ts); that is not a filter named "search".
    const settings = { ...widget.settings };
    const chartOptions = settings.chartOptions as
      Record<string, unknown> | undefined;
    if (typeof chartOptions?.seedQuery === "string") {
      settings.chartOptions = {
        ...chartOptions,
        seedQuery: chartOptions.seedQuery.replaceAll("$param_search", ""),
      };
    }
    const text = `${widget.query ?? ""}\n${JSON.stringify(settings)}`;
    for (const m of text.matchAll(PARAM_REGEX)) add(m[1], widget.id);
    const parent = (
      widget.settings?.chartOptions as Record<string, unknown> | undefined
    )?.parentParameterName;
    if (typeof parent === "string" && parent) add(parent, widget.id);
  }
  return map;
}

/**
 * The widgets a filter drives: its own parameter and a range's companions
 * (`_from`/`_to`/`_min`/`_max`), never the filter card itself.
 */
export function drivenWidgetIds(
  map: ParameterConsumerMap,
  filterName: string,
  filterWidgetId: string,
): Set<string> {
  const ids = new Set<string>();
  for (const name of filterClearNames(filterName)) {
    for (const id of map[name] ?? []) ids.add(id);
  }
  ids.delete(filterWidgetId);
  return ids;
}
