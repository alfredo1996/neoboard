/**
 * Chart registry — maps chart type strings to configuration
 * including data transformation functions.
 *
 * After normalization in query-executor.ts, data from the query API
 * is always a flat array of plain { key: value } objects, regardless
 * of whether the source is Neo4j or PostgreSQL.
 *
 * The toRecords helper is kept as a safety net for backward compatibility.
 */

export type ChartType =
  | "bar"
  | "line"
  | "pie"
  | "table"
  | "single-value"
  | "graph"
  | "map"
  | "json"
  | "parameter-select";

export interface ChartConfig {
  type: ChartType;
  label: string;
  transform: (data: unknown) => unknown;
}

/**
 * Normalize query results to a flat array of record objects.
 * Handles both Neo4j (array) and PostgreSQL ({ records }) formats.
 */
function toRecords(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && "records" in data) {
    return (data as { records: Record<string, unknown>[] }).records;
  }
  return [];
}

/**
 * Transform to bar chart format: [{ label, value }] or [{ label, series1, series2 }]
 * Uses the first column as label and remaining columns as numeric series.
 */
function transformToBarData(data: unknown): unknown {
  const records = toRecords(data);
  if (!records.length) return [];
  const keys = Object.keys(records[0]);
  if (keys.length < 2) return [];
  const [labelKey, ...valueKeys] = keys;
  return records.map((r) => {
    const point: Record<string, unknown> = { label: String(r[labelKey] ?? "") };
    for (const k of valueKeys) {
      point[k] = Number(r[k]) || 0;
    }
    return point;
  });
}

/**
 * Transform to line chart format: [{ x, series1, series2 }]
 * Uses the first column as x-axis and remaining columns as series.
 */
function transformToLineData(data: unknown): unknown {
  const records = toRecords(data);
  if (!records.length) return [];
  const keys = Object.keys(records[0]);
  if (keys.length < 2) return [];
  const [xKey, ...seriesKeys] = keys;
  return records.map((r) => {
    const point: Record<string, unknown> = { x: r[xKey] };
    for (const k of seriesKeys) {
      point[k] = Number(r[k]) || 0;
    }
    return point;
  });
}

/**
 * Transform to pie chart format: [{ name, value }]
 * Uses the first column as name and second as value.
 */
function transformToPieData(data: unknown): unknown {
  const records = toRecords(data);
  if (!records.length) return [];
  const keys = Object.keys(records[0]);
  if (keys.length < 2) return [];
  return records.map((r) => ({
    name: String(r[keys[0]] ?? ""),
    value: Number(r[keys[1]]) || 0,
  }));
}

/**
 * Transform to a single value for SingleValueChart.
 */
function transformToValueData(data: unknown): unknown {
  const records = toRecords(data);
  if (records.length > 0) {
    const first = records[0];
    const values = Object.values(first);
    return values[0];
  }
  if (typeof data === "number" || typeof data === "string") return data;
  return 0;
}

/**
 * Transform to flat array of records for DataGrid.
 */
function transformToTableData(data: unknown): unknown {
  return toRecords(data);
}

/**
 * Safely extract a usable string ID from a value that may be a string,
 * number, or a serialized Neo4j Integer ({low, high} plain object).
 */
function safeId(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (v && typeof v === "object" && "low" in v)
    return String((v as { low: number }).low);
  return String(v);
}

/**
 * Transform to graph format: { nodes, edges }
 * Extracts Neo4j graph structures from query results.
 * Handles Node, Relationship, and Path objects (including nested segments).
 */
function transformToGraphData(data: unknown): unknown {
  const records = toRecords(data);
  const nodesMap = new Map<string, Record<string, unknown>>();
  const edgesMap = new Map<string, Record<string, unknown>>();

  function addNode(v: Record<string, unknown>) {
    const id = safeId(v.elementId ?? v.identity ?? Math.random());
    if (!nodesMap.has(id)) {
      const labels = (v.labels as string[]) ?? [];
      const props = (v.properties as Record<string, unknown>) ?? {};
      nodesMap.set(id, {
        id,
        label: props.name ?? props.title ?? labels[0] ?? id,
        labels,
        category: labels[0],
        properties: props,
      });
    }
  }

  function addEdge(v: Record<string, unknown>) {
    const edgeId = safeId(
      v.elementId ?? v.identity ?? `${v.startNodeElementId ?? v.start}-${v.type}-${v.endNodeElementId ?? v.end}`
    );
    if (!edgesMap.has(edgeId)) {
      edgesMap.set(edgeId, {
        source: safeId(v.startNodeElementId ?? v.start),
        target: safeId(v.endNodeElementId ?? v.end),
        label: String(v.type),
        properties: (v.properties ?? {}) as Record<string, unknown>,
      });
    }
  }

  function isNode(v: Record<string, unknown>): boolean {
    return "labels" in v && "properties" in v;
  }

  function isRelationship(v: Record<string, unknown>): boolean {
    return "type" in v && "start" in v && "end" in v;
  }

  function isPath(v: Record<string, unknown>): boolean {
    return "segments" in v && Array.isArray(v.segments) && "start" in v && "end" in v && !("type" in v);
  }

  function extractGraphValue(value: unknown) {
    if (!value || typeof value !== "object") return;
    const v = value as Record<string, unknown>;

    if (isNode(v)) {
      addNode(v);
    } else if (isRelationship(v)) {
      addEdge(v);
    } else if (isPath(v)) {
      // Unpack Path: extract nodes and relationships from each segment
      const segments = v.segments as Record<string, unknown>[];
      for (const seg of segments) {
        if (seg.start && typeof seg.start === "object") {
          extractGraphValue(seg.start);
        }
        if (seg.relationship && typeof seg.relationship === "object") {
          extractGraphValue(seg.relationship);
        }
        if (seg.end && typeof seg.end === "object") {
          extractGraphValue(seg.end);
        }
      }
      // Also extract the top-level start/end nodes of the path
      if (v.start && typeof v.start === "object") extractGraphValue(v.start);
      if (v.end && typeof v.end === "object") extractGraphValue(v.end);
    }
  }

  for (const record of records) {
    for (const value of Object.values(record)) {
      extractGraphValue(value);
    }
  }

  return { nodes: Array.from(nodesMap.values()), edges: Array.from(edgesMap.values()) };
}

/**
 * Transform to map format: extract lat/lon/label from records.
 */
function transformToMapData(data: unknown): unknown {
  const records = toRecords(data);
  return records
    .filter((r) => {
      const vals = Object.values(r);
      // Need at least lat and lon numbers
      return vals.some((v) => typeof v === "number");
    })
    .map((r, i) => {
      const keys = Object.keys(r);
      // Heuristic: find lat/lon by key name, fallback to first two numbers
      const latKey = keys.find((k) => /lat/i.test(k));
      const lngKey = keys.find((k) => /lo?ng?/i.test(k));
      const labelKey = keys.find((k) => /name|label|title/i.test(k));

      if (latKey && lngKey) {
        return {
          id: String(i),
          lat: Number(r[latKey]),
          lng: Number(r[lngKey]),
          label: labelKey ? String(r[labelKey]) : undefined,
          properties: r,
        };
      }
      return null;
    })
    .filter(Boolean);
}

/**
 * Pass data through for JSON viewer.
 * Uses toRecords as a safety net to ensure the viewer always
 * receives the records array, not a metadata wrapper.
 */
function transformToJsonData(data: unknown): unknown {
  const records = toRecords(data);
  return records.length > 0 ? records : data;
}

/**
 * Transform to select data: extract first column values as options array.
 */
function transformToSelectData(data: unknown): unknown {
  const records = toRecords(data);
  if (!records.length) return [];
  const firstKey = Object.keys(records[0])[0];
  if (!firstKey) return [];
  return records.map((r) => r[firstKey]).filter((v) => v !== null && v !== undefined);
}

export const chartRegistry: Record<ChartType, ChartConfig> = {
  bar: { type: "bar", label: "Bar Chart", transform: transformToBarData },
  line: { type: "line", label: "Line Chart", transform: transformToLineData },
  pie: { type: "pie", label: "Pie Chart", transform: transformToPieData },
  table: { type: "table", label: "Data Table", transform: transformToTableData },
  "single-value": { type: "single-value", label: "Single Value", transform: transformToValueData },
  graph: { type: "graph", label: "Graph", transform: transformToGraphData },
  map: { type: "map", label: "Map", transform: transformToMapData },
  json: { type: "json", label: "JSON Viewer", transform: transformToJsonData },
  "parameter-select": { type: "parameter-select", label: "Parameter Selector", transform: transformToSelectData },
};

export function getChartConfig(type: string): ChartConfig | undefined {
  return chartRegistry[type as ChartType];
}
