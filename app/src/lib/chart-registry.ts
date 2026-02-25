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

import { normalizeValue } from "./normalize-value";
import type { ColumnMapping } from "@neoboard/components";

export type { ColumnMapping };

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

export type ConnectorType = "neo4j" | "postgresql";

export interface ChartConfig {
  type: ChartType;
  label: string;
  transform: (data: unknown) => unknown;
  transformWithMapping: (data: unknown, mapping: ColumnMapping) => unknown;
  /**
   * Validates raw data shape before transform. Returns an error string
   * when data exists but has the wrong shape for this chart type.
   * Returns null when data is valid OR empty (empty = separate "No data" state).
   */
  validate?: (data: unknown) => string | null;
  /**
   * Which connector types can produce data for this chart.
   * If omitted, the chart is compatible with all connector types.
   */
  compatibleWith?: ConnectorType[];
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
    const point: Record<string, unknown> = { label: String(normalizeValue(r[labelKey]) ?? "") };
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
    const point: Record<string, unknown> = { x: normalizeValue(r[xKey]) };
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
    name: String(normalizeValue(r[keys[0]]) ?? ""),
    value: Number(r[keys[1]]) || 0,
  }));
}

/**
 * Transform bar chart data respecting an optional column mapping.
 * Falls back to default column selection when mapping fields are absent.
 */
function transformToBarDataWithMapping(
  data: unknown,
  mapping: ColumnMapping
): unknown {
  const records = toRecords(data);
  if (!records.length) return [];
  const keys = Object.keys(records[0]);
  if (keys.length < 2) return [];

  const labelKey = mapping.xAxis && keys.includes(mapping.xAxis) ? mapping.xAxis : keys[0];

  let valueKeys: string[];
  if (mapping.yAxis && mapping.yAxis.length > 0) {
    valueKeys = mapping.yAxis.filter((k) => keys.includes(k));
  } else {
    valueKeys = keys.filter((k) => k !== labelKey);
  }
  if (valueKeys.length === 0) valueKeys = keys.filter((k) => k !== labelKey);

  return records.map((r) => {
    const point: Record<string, unknown> = { label: String(r[labelKey] ?? "") };
    for (const k of valueKeys) {
      point[k] = Number(r[k]) || 0;
    }
    return point;
  });
}

/**
 * Transform line chart data respecting an optional column mapping.
 * Falls back to default column selection when mapping fields are absent.
 */
function transformToLineDataWithMapping(
  data: unknown,
  mapping: ColumnMapping
): unknown {
  const records = toRecords(data);
  if (!records.length) return [];
  const keys = Object.keys(records[0]);
  if (keys.length < 2) return [];

  const xKey = mapping.xAxis && keys.includes(mapping.xAxis) ? mapping.xAxis : keys[0];

  let seriesKeys: string[];
  if (mapping.yAxis && mapping.yAxis.length > 0) {
    seriesKeys = mapping.yAxis.filter((k) => keys.includes(k));
  } else {
    seriesKeys = keys.filter((k) => k !== xKey);
  }
  if (seriesKeys.length === 0) seriesKeys = keys.filter((k) => k !== xKey);

  return records.map((r) => {
    const point: Record<string, unknown> = { x: r[xKey] };
    for (const k of seriesKeys) {
      point[k] = Number(r[k]) || 0;
    }
    return point;
  });
}

/**
 * Transform pie chart data respecting an optional column mapping.
 * Falls back to default column selection when mapping fields are absent.
 */
function transformToPieDataWithMapping(
  data: unknown,
  mapping: ColumnMapping
): unknown {
  const records = toRecords(data);
  if (!records.length) return [];
  const keys = Object.keys(records[0]);
  if (keys.length < 2) return [];

  const nameKey = mapping.xAxis && keys.includes(mapping.xAxis) ? mapping.xAxis : keys[0];
  const valueKey =
    mapping.yAxis?.[0] && keys.includes(mapping.yAxis[0])
      ? mapping.yAxis[0]
      : keys.find((k) => k !== nameKey) ?? keys[1];

  return records.map((r) => ({
    name: String(r[nameKey] ?? ""),
    value: Number(r[valueKey]) || 0,
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
    return normalizeValue(values[0]) ?? 0;
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

// ─── Validators ────────────────────────────────────────────────────────────
// Each returns null if valid or empty, error string if rows exist but shape is wrong.

function validateBarData(data: unknown): string | null {
  const records = toRecords(data);
  if (!records.length) return null;
  const cols = Object.keys(records[0]).length;
  if (cols < 2)
    return `Bar chart requires at least 2 columns: first column for category labels (x-axis) and one or more columns for numeric values (y-axis). Your query returned only ${cols} column(s). Example: \`SELECT category, count FROM ...\``;
  return null;
}

function validateLineData(data: unknown): string | null {
  const records = toRecords(data);
  if (!records.length) return null;
  const cols = Object.keys(records[0]).length;
  if (cols < 2)
    return `Line chart requires at least 2 columns: first column for x-axis values (dates, numbers, or labels) and one or more columns for numeric series. Your query returned only ${cols} column(s). Example: \`SELECT date, revenue FROM ...\``;
  return null;
}

function validatePieData(data: unknown): string | null {
  const records = toRecords(data);
  if (!records.length) return null;
  const cols = Object.keys(records[0]).length;
  if (cols < 2)
    return `Pie chart requires exactly 2 columns: first column for slice names and second column for numeric values. Your query returned only ${cols} column(s). Example: \`SELECT category, total FROM ...\``;
  return null;
}

function validateValueData(data: unknown): string | null {
  const records = toRecords(data);
  if (!records.length) {
    if (typeof data === "number" || typeof data === "string") return null;
    return null; // empty = "No data" state, not format error
  }
  const first = records[0];
  const values = Object.values(first);
  if (!values.length)
    return "Single value chart requires at least 1 column with a scalar value (number or string). Your query returned no usable values.";
  return null;
}

function validateGraphData(data: unknown): string | null {
  const records = toRecords(data);
  if (!records.length) return null;
  // Check if any record value looks like a node or relationship
  for (const record of records) {
    for (const value of Object.values(record)) {
      if (value && typeof value === "object") {
        const v = value as Record<string, unknown>;
        if ("labels" in v && "properties" in v) return null; // node found
        if ("type" in v && "start" in v && "end" in v) return null; // relationship found
        if ("segments" in v && "start" in v && "end" in v) return null; // path found
      }
    }
  }
  return "Graph chart requires Neo4j node and relationship data. Your query did not return any graph structures (nodes, relationships, or paths). Example: `MATCH (n)-[r]->(m) RETURN n, r, m`";
}

function validateMapData(data: unknown): string | null {
  const records = toRecords(data);
  if (!records.length) return null;
  const keys = Object.keys(records[0]);
  const hasLat = keys.some((k) => /lat/i.test(k));
  const hasLng = keys.some((k) => /lo?ng?/i.test(k));
  if (!hasLat || !hasLng)
    return "Map chart requires columns with latitude and longitude values. No columns matching lat/lng patterns were found. Use column names containing 'lat' and 'lng'/'lon'. Example: `SELECT name, latitude, longitude FROM ...`";
  return null;
}

export const chartRegistry: Record<ChartType, ChartConfig> = {
  bar: {
    type: "bar",
    label: "Bar Chart",
    transform: transformToBarData,
    transformWithMapping: transformToBarDataWithMapping,
    validate: validateBarData,
    compatibleWith: ["neo4j", "postgresql"],
  },
  line: {
    type: "line",
    label: "Line Chart",
    transform: transformToLineData,
    transformWithMapping: transformToLineDataWithMapping,
    validate: validateLineData,
    compatibleWith: ["neo4j", "postgresql"],
  },
  pie: {
    type: "pie",
    label: "Pie Chart",
    transform: transformToPieData,
    transformWithMapping: transformToPieDataWithMapping,
    validate: validatePieData,
    compatibleWith: ["neo4j", "postgresql"],
  },
  table: {
    type: "table",
    label: "Data Table",
    transform: transformToTableData,
    transformWithMapping: (data) => transformToTableData(data),
    compatibleWith: ["neo4j", "postgresql"],
  },
  "single-value": {
    type: "single-value",
    label: "Single Value",
    transform: transformToValueData,
    transformWithMapping: (data) => transformToValueData(data),
    validate: validateValueData,
    compatibleWith: ["neo4j", "postgresql"],
  },
  // Graph visualization requires Neo4j node/relationship structures — not available from PostgreSQL.
  graph: {
    type: "graph",
    label: "Graph",
    transform: transformToGraphData,
    transformWithMapping: (data) => transformToGraphData(data),
    validate: validateGraphData,
    compatibleWith: ["neo4j"],
  },
  map: {
    type: "map",
    label: "Map",
    transform: transformToMapData,
    transformWithMapping: (data) => transformToMapData(data),
    validate: validateMapData,
    compatibleWith: ["neo4j", "postgresql"],
  },
  json: {
    type: "json",
    label: "JSON Viewer",
    transform: transformToJsonData,
    transformWithMapping: (data) => transformToJsonData(data),
    compatibleWith: ["neo4j", "postgresql"],
  },
  "parameter-select": {
    type: "parameter-select",
    label: "Parameter Selector",
    transform: transformToSelectData,
    transformWithMapping: (data) => transformToSelectData(data),
    compatibleWith: ["neo4j", "postgresql"],
  },
};

export function getChartConfig(type: string): ChartConfig | undefined {
  return chartRegistry[type as ChartType];
}

/**
 * Returns all ChartTypes compatible with the given connector type.
 *
 * An unknown connectorType string returns an empty array so callers
 * always receive a predictable result (no implicit "show everything").
 */
export function getCompatibleChartTypes(connectorType: string): ChartType[] {
  const known: ConnectorType[] = ["neo4j", "postgresql"];
  if (!known.includes(connectorType as ConnectorType)) return [];
  const ct = connectorType as ConnectorType;
  return (Object.values(chartRegistry) as ChartConfig[])
    .filter((cfg) => !cfg.compatibleWith || cfg.compatibleWith.includes(ct))
    .map((cfg) => cfg.type);
}

