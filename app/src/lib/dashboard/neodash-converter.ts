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
  treemap: "treemap",
  sankey: "sankey",
  radar: "radar",
  area: "line",
  iFrame: "iframe",
  iframe: "iframe",
  gantt: "gantt",
  select: "parameter-select",
  markdown: "markdown",
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
): Record<string, unknown> | undefined {
  const rules = settings.actionsRules;
  if (!Array.isArray(rules) || rules.length === 0) return undefined;

  // Take the first rule as the primary click action
  const rule = rules[0] as Record<string, unknown>;
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

export function convertNeoDash(json: unknown): NeoboardExport {
  return convertNeoDashWithNotes(json).export;
}

export function convertNeoDashWithNotes(json: unknown): ConversionResult {
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
      const clickAction = convertReportActions(reportSettings);
      const stylingConfig = convertStyleRules(reportSettings);
      const refreshSettings = convertRefreshRate(reportSettings);
      const paramDefaults = convertParameterDefaults(reportSettings);

      widgets.push({
        id: widgetId,
        chartType,
        connectionId: "",
        query: convertParamSyntax(report.query ?? ""),
        params: report.parameters ?? {},
        settings: {
          ...reportSettings,
          // Preserve report title as widget title
          ...(report.title ? { title: report.title } : {}),
          // Set area mode for NeoDash "area" chart type
          ...(originalType === "area" ? { chartOptions: { area: true } } : {}),
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
