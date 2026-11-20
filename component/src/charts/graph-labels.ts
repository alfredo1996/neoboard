// Pure helpers, kept out of graph-chart.tsx so server code can import them
// without evaluating NVL (#2059, #2515).
import type { GraphNode, GraphEdge } from "./types";
import type { StylingRule } from "./styling-rule";
import { resolveStylingRuleColor } from "./styling-rule";
import { HASTINGS_LIGHT, HASTINGS_DARK } from "./theme";
import { toNvlColor } from "./nvl-color";

/**
 * Node-label palettes — the Hastings chart palette (#2226), the default of every
 * other chart, so the graph reads as part of the same system. Light/dark
 * variants track the theme (#2229).
 */
const LABEL_COLOR_PALETTE_LIGHT = HASTINGS_LIGHT;
const LABEL_COLOR_PALETTE_DARK = HASTINGS_DARK;

/** The label a node is coloured and counted by: its last one. */
export function colorLabel(node: GraphNode): string | undefined {
  return node.labels?.[node.labels.length - 1];
}

/**
 * Builds a map of node label → palette color.
 * Labels are sorted so the same set of labels always yields the same colors.
 */
export function buildLabelColorMap(
  nodes: GraphNode[],
  dark: boolean,
): Map<string, string> {
  const palette = dark ? LABEL_COLOR_PALETTE_DARK : LABEL_COLOR_PALETTE_LIGHT;
  const labels = new Set<string>();
  for (const node of nodes) {
    if (node.labels) {
      for (const lbl of node.labels) labels.add(lbl);
    }
  }
  const sorted = Array.from(labels).sort((a, b) => a.localeCompare(b));
  const map = new Map<string, string>();
  sorted.forEach((lbl, i) => {
    // NVL only renders hex; the citrine palette is authored in hsl() (#1157).
    map.set(lbl, toNvlColor(palette[i % palette.length]));
  });
  return map;
}

/**
 * Converts a property value to a human-readable string for graph display.
 * Every value arrives as the row value contract's own forms (#1904) — ISO-8601
 * strings for temporals, decimal strings past a double — so a `Date` cannot
 * reach here.
 */
function graphPrimitiveString(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "string") return val;
  if (
    typeof val === "number" ||
    typeof val === "boolean" ||
    typeof val === "bigint"
  ) {
    return String(val);
  }
  // Lists and maps as JSON; a function or symbol (never in row data) as "".
  return JSON.stringify(val) ?? "";
}

/**
 * Resolve the caption for a node given the captionMap.
 */
export function resolveCaption(
  node: GraphNode,
  captionMap: Record<string, string>,
): string {
  const nodeLabels = node.labels ?? [];
  const props = node.properties ?? {};
  for (const lbl of nodeLabels) {
    const propKey = captionMap[lbl];
    if (propKey && propKey in props) {
      const val = props[propKey];
      if (val !== null && val !== undefined) return graphPrimitiveString(val);
    }
  }
  return node.label ?? node.id;
}

/**
 * The colour a node is painted: styling rule > explicit node.color > label
 * palette, as hex (NVL doesn't render hsl(), whatever the source, #1157).
 * The legend reads this too, so its swatches match the canvas.
 */
export function nodeColor(
  node: GraphNode,
  labelColorMap: Map<string, string>,
  stylingRules?: StylingRule[],
  paramValues?: Record<string, unknown>,
): string | undefined {
  const ruleColor =
    stylingRules?.length && node.value != null
      ? resolveStylingRuleColor(node.value, stylingRules, paramValues)
      : undefined;
  const label = colorLabel(node);
  const raw =
    ruleColor ??
    node.color ??
    (label === undefined ? undefined : labelColorMap.get(label));
  return raw === undefined ? undefined : toNvlColor(raw);
}

/**
 * What a node is called and painted in this graph: the caption its hover shows
 * and the colour of its legend swatch. The inspector reads it so its title and
 * dot match the canvas (#2515).
 */
export function graphNodeCaption(
  node: GraphNode,
  captionMap: Record<string, string>,
): string {
  return resolveCaption(node, captionMap);
}

export function describeGraphNode(
  node: GraphNode,
  allNodes: GraphNode[],
  captionMap: Record<string, string>,
  dark: boolean,
): { caption: string; color: string | undefined } {
  return {
    caption: resolveCaption(node, captionMap),
    color: nodeColor(node, buildLabelColorMap(allNodes, dark)),
  };
}

/** NVL's id for the index-th edge, also how a click is mapped back to it. */
export function relationshipId(edge: GraphEdge, index: number): string {
  return `rel-${edge.source}-${edge.target}-${index}`;
}
