import type { GraphNode } from "@neoboard/components";
import { transformToGraphData } from "./transform";
import { rawColumnsOf } from "../utils";
import { clickScalar } from "@/lib/widget/resolve-click-action";

/** What a click on a graph node resolves click actions against (#2526). */
export function graphNodeClickPayload(
  node: GraphNode,
): Record<string, unknown> {
  return {
    nodeId: node.id,
    labels: node.labels ?? [],
    ...rawColumnsOf({ properties: node.properties }),
  };
}

/**
 * The "Value from" options for a graph widget: the node property keys that
 * hold a value a click can set (a list or map sets nothing), so the first
 * option always works (#2526).
 */
export function graphClickFields(data: unknown): string[] {
  const { nodes } = transformToGraphData(data) as { nodes: GraphNode[] };
  const keys = new Set<string>();
  for (const node of nodes) {
    for (const [key, value] of Object.entries(
      rawColumnsOf({ properties: node.properties }),
    )) {
      if (clickScalar(value) !== undefined) keys.add(key);
    }
  }
  return [...keys];
}
