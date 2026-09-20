/**
 * The graph shapes a result row may hold, and the guards that recognise them.
 *
 * A deliberate mirror of the SDK's row value contract (#1904). `component/`
 * may not import `@neoboard/connector-sdk`, and `app/` may not import
 * `@neoboard/connection` from anything the browser bundles — that barrel pulls
 * the drivers, and with them `fs`, `net` and `tls`. So the contract's three
 * guards live here, where both layers can reach them, next to the widened
 * `DatabaseSchema` mirror that exists for the same reason.
 *
 * They read the `$type` tag and nothing else. Duck-typing by key set is what
 * #1925 removed: `"labels" in v && "properties" in v` is a guess about one
 * driver's output that a JSON column also satisfies.
 *
 * `app/src/lib/__tests__/row-shape-mirror.test.ts` pins these against the real
 * SDK guards, so the mirror cannot drift.
 */

/** A graph node as a row value — the SDK's shape, not the chart's `GraphNode`. */
export interface GraphNodeValue {
  $type: "node";
  identity: number | string;
  elementId: string;
  labels: string[];
  properties: Record<string, unknown>;
}

export interface GraphRelationshipValue {
  $type: "relationship";
  identity: number | string;
  elementId: string;
  type: string;
  properties: Record<string, unknown>;
  /** Absent on an unbound relationship: there is nothing to draw it between. */
  start?: number | string;
  end?: number | string;
  startNodeElementId?: string;
  endNodeElementId?: string;
}

export interface GraphPathValue {
  $type: "path";
  start: GraphNodeValue;
  end: GraphNodeValue;
  segments: Array<{
    start: GraphNodeValue;
    relationship: GraphRelationshipValue;
    end: GraphNodeValue;
  }>;
  length: number;
}

function tagOf(v: unknown): string | undefined {
  if (!v || typeof v !== "object") return undefined;
  const tag = (v as { $type?: unknown }).$type;
  return typeof tag === "string" ? tag : undefined;
}

export function isGraphNode(v: unknown): v is GraphNodeValue {
  return tagOf(v) === "node";
}

export function isGraphRelationship(v: unknown): v is GraphRelationshipValue {
  return tagOf(v) === "relationship";
}

export function isGraphPath(v: unknown): v is GraphPathValue {
  return tagOf(v) === "path";
}
