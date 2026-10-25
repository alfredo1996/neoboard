/**
 * What the sunburst draws, and how a click moves it (#2231). Pure functions:
 * the chart component keeps only the drill path in state.
 *
 * A drill path is the names from the top down to the node that is the centre
 * of the view; `[]` is the overview.
 */
import { labelColorOn, legibleFill, mixColors } from "./chart-utils";

export interface SunburstSourceNode {
  name: string;
  value?: number;
  children?: SunburstSourceNode[];
}

export interface PaintedNode extends SunburstSourceNode {
  itemStyle: { color: string; borderColor: string; borderWidth: number };
  label: { color: string };
  children?: PaintedNode[];
}

/** How far a child's fill moves toward the card, by depth and sibling slot. */
function stepToward(depth: number, sibling: number): number {
  if (depth === 1) return 0;
  if (depth === 2) return 0.3 + (sibling % 3) * 0.18;
  return 0.6 + (sibling % 2) * 0.1;
}

/**
 * One muted hue per top category, lighter steps for its children, each with
 * the label colour that reads on its fill. Painted once on the whole tree, so
 * a node keeps its colour whichever level the view is centred on.
 */
export function paintTree(
  items: SunburstSourceNode[],
  bases: string[],
  card: string,
): PaintedNode[] {
  const paint = (
    nodes: SunburstSourceNode[],
    base: string | undefined,
    depth: number,
  ): PaintedNode[] =>
    nodes.map((node, i) => {
      const hue = base ?? bases[i % bases.length];
      // A top hue is the palette's, or the author's own rule colour: kept as
      // given. Only the steps derived from it are nudged to be legible.
      const fill =
        depth === 1
          ? hue
          : legibleFill(mixColors(hue, card, stepToward(depth, i)), card);
      return {
        ...node,
        itemStyle: { color: fill, borderColor: card, borderWidth: 1.5 },
        label: { color: labelColorOn(fill) },
        children: node.children?.length
          ? paint(node.children, hue, depth + 1)
          : undefined,
      };
    });
  return paint(items, undefined, 1);
}

function nodeAt(nodes: PaintedNode[], path: string[]): PaintedNode | undefined {
  let level = nodes;
  let found: PaintedNode | undefined;
  for (const name of path) {
    found = level.find((n) => n.name === name);
    if (!found) return undefined;
    level = found.children ?? [];
  }
  return found;
}

function trim(nodes: PaintedNode[], rings: number): PaintedNode[] {
  return nodes.map((n) => ({
    ...n,
    children: rings > 1 && n.children ? trim(n.children, rings - 1) : undefined,
  }));
}

/**
 * The drill, or the overview when it no longer leads to a node with children
 * (the data refreshed).
 */
export function resolveDrill(
  painted: PaintedNode[],
  drill: string[],
): string[] {
  return nodeAt(painted, drill)?.children?.length ? drill : [];
}

/**
 * The nodes to hand ECharts: the children of the drilled node, cut to
 * `rings` rings. `rings` undefined keeps every ring.
 */
export function viewOf(
  painted: PaintedNode[],
  drill: string[],
  rings: number | undefined,
): PaintedNode[] {
  const centre = resolveDrill(painted, drill);
  const nodes = centre.length
    ? (nodeAt(painted, centre)?.children ?? painted)
    : painted;
  return rings === undefined ? nodes : trim(nodes, rings);
}

/**
 * The drill after a click. `relative` is the clicked node's path from the
 * view's centre (ECharts' `treePathInfo` without its virtual root). A node
 * with children becomes the centre; a node without any has nowhere to go.
 */
export function drillAfterClick(
  painted: PaintedNode[],
  drill: string[],
  relative: string[],
): string[] {
  const target = [...drill, ...relative];
  return nodeAt(painted, target)?.children?.length ? target : drill;
}

/** A node's value: its own, or its children's sum when that is larger. */
export function sumValue(nodes: SunburstSourceNode[]): number {
  return nodes.reduce((total, n) => {
    const own = typeof n.value === "number" ? n.value : 0;
    const fromChildren = n.children?.length ? sumValue(n.children) : 0;
    return total + Math.max(own, fromChildren);
  }, 0);
}
