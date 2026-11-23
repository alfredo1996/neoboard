import type { GraphNode } from "@neoboard/components";
import { transformToGraphData } from "./transform";

// resolve-click-action.ts presence-tests these to switch into its table
// cell-click branch, so a node property of either name must not reach it.
const CONTROL_KEYS = new Set(["_clickedValue", "_clickedColumn"]);

// What a click always carries. A node property of the same name loses to
// these, so `nodeId` and `labels` mean the node's id and labels (#2526).
const NODE_KEYS = ["nodeId", "labels"];

/** What a click on a graph node resolves click actions against (#2526). */
export function graphNodeClickPayload(
  node: GraphNode,
): Record<string, unknown> {
  const props = Object.fromEntries(
    Object.entries(node.properties ?? {}).filter(
      ([key]) => !CONTROL_KEYS.has(key),
    ),
  );
  return { ...props, nodeId: node.id, labels: node.labels ?? [] };
}

/** The "Value from" options for a graph widget: the click payload's keys. */
export function graphClickFields(data: unknown): string[] {
  const { nodes } = transformToGraphData(data) as { nodes: GraphNode[] };
  const keys = new Set<string>(NODE_KEYS);
  for (const node of nodes) {
    for (const key of Object.keys(node.properties ?? {})) {
      if (!CONTROL_KEYS.has(key)) keys.add(key);
    }
  }
  return [...keys];
}
