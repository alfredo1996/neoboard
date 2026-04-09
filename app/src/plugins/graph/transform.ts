/**
 * Graph chart data transform and validator.
 */

import { toRecords, normalizeValue } from "../transforms/shared-utils";

/**
 * Normalize all properties in a record, converting non-primitives to display strings.
 */
function normalizeProps(
  props: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    out[k] = normalizeValue(v) ?? v;
  }
  return out;
}

function isNode(v: Record<string, unknown>): boolean {
  return "labels" in v && "properties" in v;
}

function isRelationship(v: Record<string, unknown>): boolean {
  return "type" in v && "start" in v && "end" in v;
}

function isPath(v: Record<string, unknown>): boolean {
  return (
    "segments" in v &&
    Array.isArray(v.segments) &&
    "start" in v &&
    "end" in v &&
    !("type" in v)
  );
}

/**
 * Transform to graph format: { nodes, edges }
 * Extracts Neo4j graph structures from query results.
 * Handles Node, Relationship, and Path objects (including nested segments).
 */
export function transformToGraphData(data: unknown): unknown {
  const records = toRecords(data);
  const nodesMap = new Map<string, Record<string, unknown>>();
  const edgesMap = new Map<string, Record<string, unknown>>();

  function addNode(v: Record<string, unknown>) {
    const id = String(v.elementId ?? v.identity ?? crypto.randomUUID());
    if (!nodesMap.has(id)) {
      const labels = (v.labels as string[]) ?? [];
      const rawProps = (v.properties as Record<string, unknown>) ?? {};
      const props = normalizeProps(rawProps);
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
    const edgeId = String(
      v.elementId ??
        v.identity ??
        `${v.startNodeElementId ?? v.start}-${v.type}-${v.endNodeElementId ?? v.end}`,
    );
    if (!edgesMap.has(edgeId)) {
      const rawProps = (v.properties ?? {}) as Record<string, unknown>;
      edgesMap.set(edgeId, {
        id: edgeId,
        source: String(v.startNodeElementId ?? v.start),
        target: String(v.endNodeElementId ?? v.end),
        label: String(v.type),
        properties: normalizeProps(rawProps),
      });
    }
  }

  function extractGraphValue(value: unknown) {
    if (!value || typeof value !== "object") return;
    const v = value as Record<string, unknown>;

    if (isNode(v)) {
      addNode(v);
    } else if (isRelationship(v)) {
      addEdge(v);
    } else if (isPath(v)) {
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
      if (v.start && typeof v.start === "object") extractGraphValue(v.start);
      if (v.end && typeof v.end === "object") extractGraphValue(v.end);
    }
  }

  for (const record of records) {
    for (const value of Object.values(record)) {
      extractGraphValue(value);
    }
  }

  return {
    nodes: Array.from(nodesMap.values()),
    edges: Array.from(edgesMap.values()),
  };
}

/**
 * Validates raw data shape for graph charts.
 * Returns null if valid or empty, error string if rows exist but contain no graph structures.
 */
export function validateGraphData(data: unknown): string | null {
  const records = toRecords(data);
  if (!records.length) return null;
  for (const record of records) {
    for (const value of Object.values(record)) {
      if (value && typeof value === "object") {
        const v = value as Record<string, unknown>;
        if ("labels" in v && "properties" in v) return null;
        if ("type" in v && "start" in v && "end" in v) return null;
        if ("segments" in v && "start" in v && "end" in v) return null;
      }
    }
  }
  return "Graph chart requires Neo4j node and relationship data. Your query did not return any graph structures (nodes, relationships, or paths). Example: `MATCH (n)-[r]->(m) RETURN n, r, m`";
}
