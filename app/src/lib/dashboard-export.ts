import type { Dashboard, DashboardLayoutV2, DashboardPage } from "@/lib/db/schema";

export interface NeoboardExport {
  formatVersion: 1;
  exportedAt: string;
  dashboard: { name: string; description: string | null };
  connections: Record<string, { name: string; type: string }>;
  layout: DashboardLayoutV2;
}

export function buildExportPayload(
  dashboard: Dashboard,
  connectionRows: { id: string; name: string; type: string }[]
): NeoboardExport {
  const layout = dashboard.layoutJson as DashboardLayoutV2;

  // Gather all unique non-empty connectionIds across all pages
  const idOrder: string[] = [];
  const seen = new Set<string>();
  for (const page of layout.pages) {
    for (const widget of page.widgets) {
      if (widget.connectionId && !seen.has(widget.connectionId)) {
        seen.add(widget.connectionId);
        idOrder.push(widget.connectionId);
      }
    }
  }

  // Build idToKey map: original connectionId → "conn_N"
  const idToKey: Record<string, string> = {};
  for (let i = 0; i < idOrder.length; i++) {
    idToKey[idOrder[i]] = `conn_${i}`;
  }

  // Build connections map: "conn_N" → { name, type }
  const connectionMap: Record<string, { name: string; type: string }> = {};
  const rowsById = new Map(connectionRows.map((r) => [r.id, r]));
  for (const [origId, key] of Object.entries(idToKey)) {
    const row = rowsById.get(origId);
    if (row) {
      connectionMap[key] = { name: row.name, type: row.type };
    }
  }

  // Deep-clone layout and replace connectionIds
  const clonedPages: DashboardPage[] = layout.pages.map((page) => ({
    ...page,
    widgets: page.widgets.map((widget) => ({
      ...widget,
      connectionId: widget.connectionId
        ? (idToKey[widget.connectionId] ?? widget.connectionId)
        : "",
    })),
    gridLayout: page.gridLayout.map((item) => ({ ...item })),
  }));

  const clonedLayout: DashboardLayoutV2 = {
    version: 2,
    pages: clonedPages,
    ...(layout.settings ? { settings: { ...layout.settings } } : {}),
  };

  return {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    dashboard: {
      name: dashboard.name,
      description: dashboard.description ?? null,
    },
    connections: connectionMap,
    layout: clonedLayout,
  };
}
