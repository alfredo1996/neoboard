import type {
  DashboardLayoutV2,
  GridLayoutItem,
  DashboardWidget,
} from "@/lib/db/schema";
import type { NeoboardExport } from "@/lib/dashboard/dashboard-export";

const CHART_TYPE_MAP: Record<string, string> = {
  table: "table",
  bar: "bar",
  line: "line",
  graph: "graph",
  graph3d: "graph",
  "3d-graph": "graph",
  map: "map",
  choropleth: "choropleth",
  areamap: "choropleth",
  pie: "pie",
  value: "single-value",
  gauge: "gauge",
  sunburst: "sunburst",
  circle_packing: "circle-packing",
  circlePacking: "circle-packing",
  treemap: "treemap",
  sankey: "sankey",
  radar: "radar",
  area: "line",
  iFrame: "iframe",
  iframe: "iframe",
  gantt: "gantt",
  select: "parameter-select",
  markdown: "markdown",
  text: "markdown",
  form: "form",
  json: "json",
};

/** NeoDash types that get mapped to a different NeoBoard type. */
const DOWNGRADED_TYPES: Record<string, string> = {
  graph3d: "graph (2D — 3D view lost)",
  "3d-graph": "graph (2D — 3D view lost)",
};

/**
 * Convert NeoDash parameter syntax to NeoBoard syntax.
 * NeoDash: $neodash_paramName → NeoBoard: $param_paramName
 */
function convertParamSyntax(query: string): string {
  return query.replace(/\$neodash_/g, "$param_");
}

// ---------------------------------------------------------------------------
// NeoDash settings → NeoBoard settings mappers
// ---------------------------------------------------------------------------

/**
 * Map NeoDash Report Actions to NeoBoard click action format.
 * NeoDash: report.settings.actionsRules = [{ condition, field, value, customization }]
 * NeoBoard: settings.clickAction = { type, parameterMapping, targetPageId }
 */
function convertReportActions(
  settings: Record<string, unknown>,
  notes?: string[],
  widgetTitle?: string,
): Record<string, unknown> | undefined {
  const rules = settings.actionsRules;
  if (!Array.isArray(rules) || rules.length === 0) return undefined;

  // NeoBoard supports one click action per widget; NeoDash allows many
  // value-conditional rules. Import the first and surface the rest as a
  // non-blocking note rather than silently dropping them (#882).
  if (rules.length > 1 && notes) {
    notes.push(
      `"${widgetTitle ?? "Untitled widget"}": dropped ${rules.length - 1} ` +
        `secondary click action rule(s) — NeoBoard supports one click action per widget`,
    );
  }

  // Take the first rule as the primary click action
  const rule = rules[0] as Record<string, unknown>;

  // NeoDash "set variable" string shape: parameter name lives in customizationValue.
  // Observed in real-world exports (OpenStudyBuilder corpus) — every action used
  // this shape and was silently dropped by the object-only branch below.
  if (typeof rule.customization === "string") {
    if (
      rule.customization === "set variable" &&
      typeof rule.customizationValue === "string"
    ) {
      return {
        type: "set-parameter",
        parameterMapping: {
          parameterName: rule.customizationValue,
          sourceField: typeof rule.field === "string" ? rule.field : "",
        },
      };
    }
    return undefined;
  }

  const customization = rule.customization as
    | Record<string, unknown>
    | undefined;

  if (customization?.type === "set-parameter") {
    return {
      type: "set-parameter",
      parameterMapping: {
        parameterName: String(customization.parameterName ?? ""),
        sourceField: String(rule.field ?? ""),
      },
    };
  }

  if (customization?.type === "navigate") {
    return {
      type: "navigate-to-page",
      targetPageId: String(customization.pageId ?? ""),
    };
  }

  return undefined;
}

/**
 * Map NeoDash Rule-Based Styling to NeoBoard styling config.
 * NeoDash: report.settings.styleRules = [{ field, condition, value, color }]
 * NeoBoard: settings.stylingConfig = { enabled, rules: [{ operator, value, color }] }
 */
function convertStyleRules(
  settings: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const rules = settings.styleRules;
  if (!Array.isArray(rules) || rules.length === 0) return undefined;

  const neoboardRules = rules
    .map((rule: unknown, i: number) => {
      const r = rule as Record<string, unknown>;
      const condition = String(r.condition ?? "==");
      const operatorMap: Record<string, string> = {
        "=": "==",
        "!=": "!=",
        "<": "<",
        ">": ">",
        "<=": "<=",
        ">=": ">=",
        contains: "contains",
      };
      return {
        id: "migrated-" + i,
        column: r.field ? String(r.field) : undefined,
        operator: operatorMap[condition] ?? "==",
        value: r.value ?? "",
        color: String(r.color ?? "#000000"),
      };
    })
    .filter((r) => r.color);

  if (neoboardRules.length === 0) return undefined;

  return {
    enabled: true,
    rules: neoboardRules,
  };
}

/**
 * Map NeoDash refreshRate (seconds) to NeoBoard auto-refresh settings.
 */
function convertRefreshRate(
  settings: Record<string, unknown>,
): Record<string, unknown> {
  const rate = settings.refreshRate;
  if (typeof rate !== "number" || rate <= 0) return {};
  return {
    enableCache: true,
    cacheTtlMinutes: Math.max(1, Math.round(rate / 60)),
  };
}

/**
 * Map NeoDash parameter defaults.
 */
function convertParameterDefaults(
  settings: Record<string, unknown>,
): Record<string, unknown> {
  const defaultValue = settings.defaultValue;
  if (defaultValue === undefined || defaultValue === null) return {};
  return { defaultValue };
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

interface NeoDashReport {
  id: string;
  title: string;
  type: string;
  query: string;
  x: number;
  y: number;
  width: number;
  height: number;
  settings?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
}

interface NeoDashPage {
  title: string;
  reports: NeoDashReport[];
}

interface NeoDashJson {
  title?: string;
  description?: string;
  version?: string;
  pages: NeoDashPage[];
  /**
   * NeoDash stores dashboard-wide parameters here. NeoBoard models
   * parameters as outputs of explicit parameter-select widgets, so the
   * converter auto-generates one widget per *referenced* parameter
   * (unreferenced ones are dropped with a note).
   */
  settings?: {
    parameters?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

/**
 * Inferred parameter-select `parameterType` from a NeoDash default value.
 *
 * NeoDash didn't track the parameter type — the value shape is the only
 * hint we have. The user can change the type in the widget editor.
 */
type ParameterSelectType = "select" | "text" | "multi-select" | "number-range";

export function inferParameterType(value: unknown): ParameterSelectType {
  if (Array.isArray(value)) return "multi-select";
  if (typeof value === "number" && Number.isFinite(value))
    return "number-range";
  if (typeof value === "string" && value === "") return "text";
  // "Y" / "N" / arbitrary string / null / undefined / object — default to select
  return "select";
}

/**
 * Extract every `$param_<name>` reference from a list of widget queries.
 * Returns the set of unique parameter names (without the `$param_` prefix).
 *
 * Run AFTER convertParamSyntax has rewritten `$neodash_*` → `$param_*`.
 */
export function extractParamReferences(queries: string[]): Set<string> {
  const names = new Set<string>();
  const re = /\$param_(\w+)/g;
  for (const q of queries) {
    if (!q) continue;
    for (const match of q.matchAll(re)) {
      names.add(match[1]);
    }
  }
  return names;
}

export interface ConversionResult {
  export: NeoboardExport;
  /** Notes about type downgrades or unmapped features. */
  notes: string[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function isNeoDashFormat(json: unknown): boolean {
  if (!json || typeof json !== "object" || Array.isArray(json)) return false;
  const obj = json as Record<string, unknown>;
  if (!Array.isArray(obj.pages) || obj.pages.length === 0) return false;
  return obj.pages.every((p) => {
    if (!p || typeof p !== "object" || Array.isArray(p)) return false;
    return Array.isArray((p as Record<string, unknown>).reports);
  });
}

/**
 * Convert a NeoDash dashboard JSON to NeoBoard's export envelope.
 *
 * Pass `defaultConnectionId` to assign every widget to that connection.
 * Omit to retain the legacy empty-string behavior (caller must fix up the
 * connection later, or the dashboard will render with broken widgets).
 *
 * The single-connection model matches NeoDash's actual semantics — a NeoDash
 * dashboard always pointed at one global Neo4j instance.
 */
export function convertNeoDash(
  json: unknown,
  defaultConnectionId = "",
): NeoboardExport {
  return convertNeoDashWithNotes(json, defaultConnectionId).export;
}

export function convertNeoDashWithNotes(
  json: unknown,
  defaultConnectionId = "",
): ConversionResult {
  const nd = json as NeoDashJson;
  const notes: string[] = [];

  const toFiniteNumber = (value: unknown, fallback: number): number =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;

  const pages = nd.pages.map((page) => {
    const widgets: DashboardWidget[] = [];
    const gridLayout: GridLayoutItem[] = [];

    for (const report of page.reports) {
      const widgetId = crypto.randomUUID();
      const originalType = report.type;
      const chartType = CHART_TYPE_MAP[originalType] ?? "json";

      // Track downgrades
      if (DOWNGRADED_TYPES[originalType]) {
        notes.push(
          '"' +
            report.title +
            '" (' +
            originalType +
            ") → " +
            DOWNGRADED_TYPES[originalType],
        );
      }
      if (!CHART_TYPE_MAP[originalType]) {
        notes.push(
          '"' +
            report.title +
            '" (unknown type "' +
            originalType +
            '") → JSON Viewer',
        );
      }

      // Convert settings
      const reportSettings = report.settings ?? {};
      const clickAction = convertReportActions(
        reportSettings,
        notes,
        report.title,
      );
      const stylingConfig = convertStyleRules(reportSettings);
      const refreshSettings = convertRefreshRate(reportSettings);
      const paramDefaults = convertParameterDefaults(reportSettings);

      // Markdown widget content lives in `settings.content`, not `query`.
      // NeoDash stored markdown body in `report.query`; route it correctly
      // and leave the widget's query empty (markdown is content-only).
      const isMarkdown = chartType === "markdown";
      if (isMarkdown && report.query) {
        notes.push('Imported markdown content for "' + report.title + '"');
      }

      widgets.push({
        id: widgetId,
        chartType,
        connectionId: defaultConnectionId,
        query: isMarkdown ? "" : convertParamSyntax(report.query ?? ""),
        params: report.parameters ?? {},
        settings: {
          ...reportSettings,
          // Preserve report title as widget title
          ...(report.title ? { title: report.title } : {}),
          // Set area mode for NeoDash "area" chart type
          ...(originalType === "area" ? { chartOptions: { area: true } } : {}),
          // Markdown: content moved out of report.query
          ...(isMarkdown ? { content: report.query ?? "" } : {}),
          // Mapped settings
          ...(clickAction ? { clickAction } : {}),
          ...(stylingConfig ? { stylingConfig } : {}),
          ...refreshSettings,
          ...paramDefaults,
        },
      });

      gridLayout.push({
        i: widgetId,
        x: toFiniteNumber(report.x, 0),
        y: toFiniteNumber(report.y, 0),
        w: toFiniteNumber(report.width, 4),
        h: toFiniteNumber(report.height, 4),
      });
    }

    return {
      id: crypto.randomUUID(),
      title: page.title,
      widgets,
      gridLayout,
    };
  });

  // Auto-generate parameter-select widgets for every $param_* referenced
  // in widget queries. NeoDash's dashboard-wide params don't map to a
  // NeoBoard concept directly; the closest is a parameter-select widget
  // that produces the value when rendered. Prepend them as a "Filters"
  // page so they're visible before the data pages.
  const filtersPage = buildFiltersPage(nd.settings?.parameters, pages, notes);
  if (filtersPage) {
    pages.unshift(filtersPage);
  }

  const layout: DashboardLayoutV2 = {
    version: 2,
    pages,
  };

  return {
    export: {
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      dashboard: {
        name: nd.title ?? "Imported Dashboard",
        description: nd.description ?? null,
      },
      connections: {},
      layout,
    },
    notes,
  };
}

/**
 * Build the auto-generated "Filters" page from NeoDash's dashboard-wide
 * parameters. Returns null when no widgets would be created (no params
 * referenced in any query, or no params at all).
 *
 * Walks two sets:
 *   1. Defined in `nd.settings.parameters` → create widget if referenced;
 *      skip with note otherwise
 *   2. Referenced in queries but not defined → create with no default + warn
 */
function buildFiltersPage(
  ndParams: Record<string, unknown> | undefined,
  pages: { widgets: DashboardWidget[] }[],
  notes: string[],
): {
  id: string;
  title: string;
  widgets: DashboardWidget[];
  gridLayout: GridLayoutItem[];
} | null {
  const params = ndParams ?? {};
  const referenced = extractParamReferences(
    pages.flatMap((p) => p.widgets.map((w) => w.query ?? "")),
  );
  const definedNames = new Set(Object.keys(params));
  const widgets: DashboardWidget[] = [];
  const gridLayout: GridLayoutItem[] = [];

  // 1. Iterate defined params: create if referenced, drop if not.
  for (const rawName of Object.keys(params)) {
    const value = params[rawName];
    const paramName = rawName.startsWith("neodash_")
      ? rawName.slice("neodash_".length)
      : rawName;

    if (!referenced.has(paramName)) {
      notes.push(
        "Parameter $param_" +
          paramName +
          " was defined in NeoDash but never referenced in any query — skipped",
      );
      continue;
    }

    const paramType = inferParameterType(value);
    addFilterWidget(widgets, gridLayout, paramName, paramType, value);
    notes.push(
      "Created parameter-select widget for $param_" +
        paramName +
        " (type: " +
        paramType +
        ")",
    );
  }

  // 2. Referenced but never defined: create with no default + warn.
  for (const paramName of referenced) {
    if (
      definedNames.has(paramName) ||
      definedNames.has("neodash_" + paramName)
    ) {
      continue;
    }
    addFilterWidget(widgets, gridLayout, paramName, "select", undefined);
    notes.push(
      "Created parameter-select widget for $param_" +
        paramName +
        " with no default (referenced in query but not defined in NeoDash settings)",
    );
  }

  if (widgets.length === 0) return null;
  return {
    id: crypto.randomUUID(),
    title: "Filters",
    widgets,
    gridLayout,
  };
}

/**
 * Tile a new parameter-select widget into the Filters page grid.
 * Layout: 4 widgets per row at w=3, h=2 (Filters page is 12 cols wide).
 */
function addFilterWidget(
  widgets: DashboardWidget[],
  gridLayout: GridLayoutItem[],
  parameterName: string,
  parameterType: ParameterSelectType,
  defaultValue: unknown,
): void {
  const id = crypto.randomUUID();
  const index = widgets.length;
  const x = (index % 4) * 3;
  const y = Math.floor(index / 4) * 2;

  const settings: Record<string, unknown> = {
    title: parameterName,
    parameterName,
    parameterType,
  };
  // Pre-populate the default when we know it. We don't try to reverse-engineer
  // the seed query for select-typed params from a hard-coded default; the user
  // can wire the seed query in the editor.
  if (defaultValue !== undefined) {
    settings.defaultValue = defaultValue;
  }
  if (parameterType === "number-range" && typeof defaultValue === "number") {
    // rangeMin/rangeMax must include defaultValue. CodeRabbit caught the
    // negative-default bug: a default of -5 with rangeMin=0 would be outside
    // the range. min(default, 0) keeps the floor at 0 for non-negative
    // defaults (common case) while widening for negatives.
    settings.rangeMin = Math.min(defaultValue, 0);
    settings.rangeMax = Math.max(defaultValue, 100);
  }

  widgets.push({
    id,
    chartType: "parameter-select",
    connectionId: "",
    query: "",
    params: {},
    settings,
  });
  gridLayout.push({ i: id, x, y, w: 3, h: 2 });
}
