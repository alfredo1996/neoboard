/**
 * Sankey chart data transform.
 */

import { toRecords, normalizeValue } from "../transforms/shared-utils";

interface SankeyLink {
  /** The query row this link came from, for the click payload (#1598). */
  properties: Record<string, unknown>;
  source: string;
  target: string;
  value: number;
}

/**
 * Which column means what, and which rows can actually be drawn. Shared by
 * the transform and by validate so the two cannot disagree about what reaches
 * the chart — the same reason gantt/transform.ts shares resolveKeys and
 * isDrawableSpan (its comment at :121-125).
 */
function buildLinks(records: Record<string, unknown>[]) {
  // Resolve source/target/value columns heuristically
  const keys = Object.keys(records[0]);
  const sourceKey = keys.find((k) => /source|from|start/i.test(k)) ?? keys[0];
  const targetKey =
    keys.find((k) => /target|to|end/i.test(k) && k !== sourceKey) ?? keys[1];
  const valueKey =
    keys.find(
      (k) =>
        /value|count|weight|amount/i.test(k) &&
        k !== sourceKey &&
        k !== targetKey,
    ) ?? keys[2];

  const links: SankeyLink[] = [];

  for (const r of records) {
    const source = String(normalizeValue(r[sourceKey]) ?? "");
    const target = String(normalizeValue(r[targetKey]) ?? "");

    // A flow from a node to itself has no geometry, and its edge holds that
    // node's in-degree above zero forever — the literal condition echarts
    // throws "Sankey is a DAG, the original data has cycle!" on
    // (echarts/lib/chart/sankey/sankeyLayout.js:152-155). The demo hits it
    // wherever a region is named after its own continent (#1656).
    //
    // An empty endpoint names no node; echarts dropped the link silently, so
    // the diagram's totals disagreed with the same query rendered as a table.
    //
    // Both are dropped WHOLE — the node goes with the row. Keeping an
    // edgeless node is not free: its layout value is 0, which zeroes
    // layoutIterations for the entire diagram (sankeyLayout.js:62-67) and
    // shrinks every other bar through minKy (sankeyLayout.js:273-284).
    if (!source || !target || source === target) continue;

    links.push({
      properties: r,
      source,
      target,
      value: valueKey ? Number(r[valueKey]) || 0 : 1,
    });
  }

  return { sourceKey, targetKey, links };
}

const nodeNames = (links: SankeyLink[]): string[] => [
  ...new Set(links.flatMap((l) => [l.source, l.target])),
];

/**
 * Transform to Sankey chart format: { nodes: [{ name }], links: [{ source, target, value }] }
 * Expects records with source, target, and value columns.
 */
export function transformToSankeyData(data: unknown): unknown {
  const records = toRecords(data);
  if (!records.length) return { nodes: [], links: [] };
  if (Object.keys(records[0]).length < 2) return { nodes: [], links: [] };

  const { links } = buildLinks(records);
  return { nodes: nodeNames(links).map((name) => ({ name })), links };
}

/**
 * Kahn's algorithm — the same peel-off-the-zero-in-degree loop echarts runs at
 * sankeyLayout.js:110-150, so the two cannot disagree about what is drawable.
 * Anything left over sits on a cycle, which echarts throws on rather than
 * draws. Self-loops are already gone, so what this finds is a real A -> B -> A;
 * breaking one needs a choice of edge that no two people would make the same
 * way, so it is reported, not repaired.
 */
function hasCycle(links: SankeyLink[]): boolean {
  const nodes = nodeNames(links);
  const inDegree = new Map(nodes.map((n) => [n, 0]));
  const outgoing = new Map<string, string[]>(nodes.map((n) => [n, []]));
  for (const { source, target } of links) {
    inDegree.set(target, (inDegree.get(target) ?? 0) + 1);
    outgoing.get(source)?.push(target);
  }

  // The queue grows as it is walked; an index cursor avoids shift().
  const queue = nodes.filter((n) => inDegree.get(n) === 0);
  for (let i = 0; i < queue.length; i++) {
    for (const next of outgoing.get(queue[i]) ?? []) {
      const remaining = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, remaining);
      if (remaining === 0) queue.push(next);
    }
  }
  return queue.length < nodes.length;
}

/**
 * Explain, before anything is drawn, why a result cannot become a sankey.
 * Returns null when it can.
 *
 * echarts throws synchronously on a cyclic flow and base-chart shows that
 * throw verbatim — "Sankey is a DAG, the original data has cycle!" names
 * neither the columns nor the rows at fault (#1656).
 */
export function validateSankeyData(data: unknown): string | null {
  const records = toRecords(data);
  if (!records.length) return null;

  const keys = Object.keys(records[0]);
  if (keys.length < 2) {
    return `Sankey needs source and target columns (optional: value) — got: ${keys.join(", ")}`;
  }

  const { sourceKey, targetKey, links } = buildLinks(records);

  // Nothing survived, so the widget would show its empty state —
  // indistinguishable from a query that genuinely returned no rows. This is
  // the defect validateGanttData's docstring (gantt/transform.ts:160-164) was
  // written against.
  if (!links.length) {
    return `No row describes a flow between two different nodes. A row is skipped when "${sourceKey}" and "${targetKey}" name the same node, or when either is empty.`;
  }

  if (hasCycle(links)) {
    return `The flow loops back on itself — following "${sourceKey}" to "${targetKey}" leads from a node back to that same node. A sankey can only draw flows that move in one direction.`;
  }
  return null;
}
