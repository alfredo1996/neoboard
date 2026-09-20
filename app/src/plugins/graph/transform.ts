/**
 * Graph chart data transform and validator.
 */

import {
  isGraphNode,
  isGraphPath,
  isGraphRelationship,
  type GraphNodeValue,
  type GraphRelationshipValue,
} from "@neoboard/components/row-shapes";
import { toRecords, normalizeValue } from "../transforms/shared-utils";
import { randomId } from "@/lib/random-id";

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

/**
 * Matches an id that is a negative integer, in the stringified form ids reach
 * `addNode` in. Used to flag virtual nodes — nodes a query fabricated, which
 * exist only inside its result and therefore have no neighbours to expand
 * into (#1361).
 *
 * This is a HEURISTIC and there is no better signal available. Measured over
 * the wire against a live graph database and its procedure library (#1361 has
 * the versions): a fabricated node is indistinguishable from a stored one —
 * same class, same fields, same brand. The sign of the id is that library's
 * own collision-avoidance convention and the only thing that separates the two
 * at ANY layer, so detecting it in the connector would be no more certain.
 * `addNode` is the one funnel every node routes through, which is why the
 * check belongs here rather than per-shape.
 *
 * What it would misfire on: a connector that allocates genuinely negative node
 * ids. Nothing shipped does.
 *
 * `-0` is excluded on purpose: node id 0 is a real node, JS stringifies `-0`
 * as `"0"` anyway, and the virtual counter starts at -1.
 */
const SYNTHETIC_ID_PATTERN = /^-[1-9]\d*$/;

/**
 * Transform to graph format: `{ nodes, edges }`.
 *
 * Reads the SDK's `$type` tag and nothing else (#1925). A cell that merely
 * looks like a node — a JSON column holding `{labels, properties}` — is data,
 * and stays data.
 */
export function transformToGraphData(data: unknown): unknown {
  const records = toRecords(data);
  const nodesMap = new Map<string, Record<string, unknown>>();
  const edgesMap = new Map<string, Record<string, unknown>>();

  function addNode(v: GraphNodeValue) {
    const id = String(v.elementId ?? v.identity ?? randomId());
    if (!nodesMap.has(id)) {
      const labels = v.labels ?? [];
      const rawProps = v.properties ?? {};
      const props = normalizeProps(rawProps);
      nodesMap.set(id, {
        id,
        label: props.name ?? props.title ?? labels[0] ?? id,
        labels,
        category: labels[0],
        properties: props,
        synthetic: SYNTHETIC_ID_PATTERN.test(id),
      });
    }
  }

  function addEdge(v: GraphRelationshipValue) {
    // An unbound relationship carries none of the four endpoint keys (#1904).
    // There is nothing to draw it between, so it is skipped rather than
    // pointed at a node called "undefined".
    const source = v.startNodeElementId ?? v.start;
    const target = v.endNodeElementId ?? v.end;
    if (source === undefined || target === undefined) return;
    const edgeId = String(
      v.elementId ?? v.identity ?? `${source}-${v.type}-${target}`,
    );
    if (!edgesMap.has(edgeId)) {
      const rawProps = v.properties ?? {};
      edgesMap.set(edgeId, {
        id: edgeId,
        source: String(source),
        target: String(target),
        label: String(v.type),
        properties: normalizeProps(rawProps),
      });
    }
  }

  function extractGraphValue(value: unknown) {
    if (isGraphNode(value)) {
      addNode(value);
    } else if (isGraphRelationship(value)) {
      addEdge(value);
    } else if (isGraphPath(value)) {
      for (const seg of value.segments ?? []) {
        extractGraphValue(seg.start);
        extractGraphValue(seg.relationship);
        extractGraphValue(seg.end);
      }
      extractGraphValue(value.start);
      extractGraphValue(value.end);
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
      if (
        isGraphNode(value) ||
        isGraphRelationship(value) ||
        isGraphPath(value)
      ) {
        return null;
      }
    }
  }
  return "Graph chart requires graph data. Your query returned rows, but none of their values is a node, a relationship or a path.";
}
