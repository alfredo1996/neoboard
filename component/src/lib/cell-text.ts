/**
 * The text a result cell shows. The table renders it, and the transforms and
 * styling rules filter, sort, group and match on it, so an object cell reads
 * the same everywhere and never as "[object Object]" (#2050, #2102).
 */
import {
  isGraphNode,
  isGraphPath,
  isGraphRelationship,
  type GraphNodeValue,
  type GraphPathValue,
  type GraphRelationshipValue,
} from "./row-shapes";

/** ` {key: value, …}`, or nothing for no properties. Values are JSON. */
function formatProperties(properties: Record<string, unknown>): string {
  const pairs = Object.entries(properties).map(
    ([key, value]) => `${key}: ${JSON.stringify(value)}`,
  );
  return pairs.length ? ` {${pairs.join(", ")}}` : "";
}

/** `:Label {…}`; a node with neither labels nor properties reads `{}`. */
function formatNode({ labels, properties }: GraphNodeValue): string {
  const text =
    labels.map((label) => `:${label}`).join("") + formatProperties(properties);
  return text.trimStart() || "{}";
}

function formatRelationship({
  type,
  properties,
}: GraphRelationshipValue): string {
  return `[:${type}${formatProperties(properties)}]`;
}

/** The chain in traversal order, each arrow pointing the relationship's way. */
function formatPath(path: GraphPathValue): string {
  let chain = `(${formatNode(path.start)})`;
  for (const { start, relationship, end } of path.segments) {
    const hop = formatRelationship(relationship);
    chain +=
      relationship.startNodeElementId === start.elementId
        ? `-${hop}->`
        : `<-${hop}-`;
    chain += `(${formatNode(end)})`;
  }
  return chain;
}

/**
 * A node, relationship or path, read off the SDK's `$type` tag (#1925) —
 * never its `$type` or `elementId`. Undefined for anything else.
 */
function formatGraphValue(v: unknown): string | undefined {
  try {
    if (isGraphNode(v)) return formatNode(v);
    if (isGraphRelationship(v)) return formatRelationship(v);
    if (isGraphPath(v)) return formatPath(v);
  } catch {
    // Tagged, but not the shape the tag claims: a JSON column holding a
    // `$type` key. It is data, and renders as JSON like any other object.
    return undefined;
  }
  return undefined;
}

/**
 * A graph value's text, or a list's or map's with each graph value inside it
 * read as its text at any depth: `collect(m)` reads
 * `[:Movie {title: "A"}, :Movie {title: "B"}]`, `{m: m}` reads
 * `{m: :Movie {…}}` (#2050). What holds no graph value stays JSON, so this is
 * undefined for it. Rows cross JSON, so nothing inside a list or map is a
 * `Date`, a `bigint` or `undefined`.
 */
function formatGraphText(v: unknown): string | undefined {
  const graph = formatGraphValue(v);
  if (graph !== undefined || v === null || typeof v !== "object") return graph;
  const entries = Object.entries(v);
  const texts = entries.map(([, value]) => formatGraphText(value));
  if (texts.every((text) => text === undefined)) return undefined;
  const isList = Array.isArray(v);
  const parts = entries.map(([key, value], i) => {
    const text = texts[i] ?? JSON.stringify(value);
    return isList ? text : `${key}: ${text}`;
  });
  return isList ? `[${parts.join(", ")}]` : `{${parts.join(", ")}}`;
}

/**
 * One cell's text. Every temporal arrives as an ISO-8601 string (#1904), so a
 * `Date` cannot reach here — rows cross JSON. A graph value reads as its
 * labels or type and properties, and so does each one inside a list or map
 * (#2050); any other object-shaped value becomes JSON.
 */
export function formatCell(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint")
    return v.toString();
  // Never String(v): on an `unknown` the type still admits an object here,
  // and "[object Object]" is exactly what the table must never show (#1636,
  // Sonar S6551). A missing key reads "null", as its cell does.
  return formatGraphText(v) ?? JSON.stringify(v) ?? "null";
}
