import type { DashboardLayoutV2, GridLayoutItem, DashboardWidget } from "@/lib/db/schema";
import type { NeoboardExport } from "@/lib/dashboard-export";

const CHART_TYPE_MAP: Record<string, string> = {
  table: "table",
  bar: "bar",
  line: "line",
  graph: "graph",
  map: "map",
  pie: "pie",
  value: "single-value",
  iframe: "json",
  markdown: "json",
};

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
  version?: string;
  pages: NeoDashPage[];
}

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
  const nd = json as NeoDashJson;

  const toFiniteNumber = (value: unknown, fallback: number): number =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;

  const pages = nd.pages.map((page) => {
    const widgets: DashboardWidget[] = [];
    const gridLayout: GridLayoutItem[] = [];

    for (const report of page.reports) {
      const widgetId = crypto.randomUUID();
      const chartType = CHART_TYPE_MAP[report.type] ?? "json";

      widgets.push({
        id: widgetId,
        chartType,
        connectionId: "",
        query: report.query ?? "",
        params: report.parameters ?? {},
        settings: report.settings ?? {},
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
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    dashboard: {
      name: nd.title ?? "Imported Dashboard",
      description: null,
    },
    connections: {},
    layout,
  };
}
