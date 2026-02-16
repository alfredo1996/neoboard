/**
 * Chart registry — maps chart type strings to configuration
 * including data transformation functions.
 *
 * Data from the query API comes in two formats:
 * - Neo4j: array of NeodashRecord objects (flat key-value)
 * - PostgreSQL: { fields, records, summary } where records is an array
 *
 * Transforms normalize both formats into what each chart component expects.
 */

export type ChartType =
  | "bar"
  | "line"
  | "pie"
  | "table"
  | "single-value"
  | "graph"
  | "map"
  | "json";

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
 * Transform to graph format: { nodes, edges }
 * Extracts Neo4j graph structures from query results.
 */
function transformToGraphData(data: unknown): unknown {
  const records = toRecords(data);
  const nodesMap = new Map<string, Record<string, unknown>>();
  const edges: Record<string, unknown>[] = [];

  for (const record of records) {
    for (const value of Object.values(record)) {
      if (value && typeof value === "object") {
        const v = value as Record<string, unknown>;
        // Neo4j Node: has identity + labels + properties
        if ("labels" in v && "properties" in v) {
          const id = String(v.identity ?? v.elementId ?? Math.random());
          if (!nodesMap.has(id)) {
            const labels = v.labels as string[];
            const props = v.properties as Record<string, unknown>;
            nodesMap.set(id, {
              id,
              label: props.name ?? props.title ?? labels?.[0] ?? id,
              category: labels?.[0] ? 0 : undefined,
              properties: props,
            });
          }
        }
        // Neo4j Relationship: has type + start + end
        if ("type" in v && "start" in v && "end" in v) {
          edges.push({
            source: String(v.start ?? v.startNodeElementId),
            target: String(v.end ?? v.endNodeElementId),
            label: String(v.type),
            properties: (v.properties ?? {}) as Record<string, unknown>,
          });
        }
      }
    }
  }

  return { nodes: Array.from(nodesMap.values()), edges };
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
 * Identity — pass data through for JSON viewer.
 */
function identity(data: unknown) {
  return data;
}

export const chartRegistry: Record<ChartType, ChartConfig> = {
  bar: { type: "bar", label: "Bar Chart", transform: transformToBarData },
  line: { type: "line", label: "Line Chart", transform: transformToLineData },
  pie: { type: "pie", label: "Pie Chart", transform: transformToPieData },
  table: { type: "table", label: "Data Table", transform: transformToTableData },
  "single-value": { type: "single-value", label: "Single Value", transform: transformToValueData },
  graph: { type: "graph", label: "Graph", transform: transformToGraphData },
  map: { type: "map", label: "Map", transform: transformToMapData },
  json: { type: "json", label: "JSON Viewer", transform: identity },
};

export function getChartConfig(type: string): ChartConfig | undefined {
  return chartRegistry[type as ChartType];
}
