import type { EChartsClickEvent } from "@neoboard/components";

/**
 * Build the click-action payload for a circle-packing click.
 *
 * #1551: the shared `useEChartsClick` resolves the row as `data[e.dataIndex]`.
 * That works for every other ECharts plugin, where `data` is the row array the
 * series was built from. Circle packing is a custom series over a d3-hierarchy
 * pack, so `data` is the nested tree while `dataIndex` indexes the flattened
 * packed-node array — unrelated orderings. The row was arbitrary or undefined,
 * and `e.name` was "" because the items carried no name.
 *
 * The chart now attaches name/nodeValue/depth to each series item, so the
 * payload is read from the event. The shared hook is deliberately untouched:
 * every other plugin depends on it, and this is the one series type whose
 * dataIndex is not a row index.
 */
export function circlePackingClickPayload(
  e: EChartsClickEvent,
): Record<string, unknown> {
  const item = (
    typeof e.data === "object" && e.data !== null ? e.data : {}
  ) as {
    name?: unknown;
    nodeValue?: unknown;
    depth?: unknown;
  };
  return {
    name: typeof item.name === "string" ? item.name : e.name,
    value: item.nodeValue,
    depth: item.depth,
  };
}
