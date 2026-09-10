import type { EChartsOption } from "echarts";
import type { ECharts } from "echarts/core";

export interface BaseChartProps {
  /** Additional CSS classes */
  className?: string;
  /** Show loading overlay */
  loading?: boolean;
  /** Error to display instead of chart */
  error?: Error | null;
  /** Raw ECharts option object (advanced usage) */
  options?: EChartsOption;
  /** Called when chart instance is ready */
  onChartReady?: (instance: ECharts) => void;
  /** Called when a chart element is clicked */
  onClick?: (params: EChartsClickEvent) => void;
  /** Called when data zoom changes */
  onDataZoom?: (params: unknown) => void;
  /** Enable scroll-to-zoom on the data axis (DataZoom type: 'inside') */
  enableDataZoom?: boolean;
  /** Custom ARIA description for screen readers (e.g. "Bar chart showing revenue by month") */
  ariaDescription?: string;
  /** Enable decal overlay patterns for colorblind accessibility */
  colorblindMode?: boolean;
  /**
   * Color palette ID from COLOR_PALETTES. Any palette other than the citrine
   * default overrides the ECharts theme colors with that palette's static
   * array; the default keeps the theme's CSS-variable colors, which are the
   * ones that change in dark mode.
   */
  colorPalette?: string;
}

export interface EChartsClickEvent {
  componentType: string;
  seriesType?: string;
  seriesIndex?: number;
  seriesName?: string;
  name: string;
  dataIndex: number;
  data: unknown;
  value: unknown;
  /**
   * Ancestor chain for hierarchical series (sunburst, treemap), root first.
   * The synthesized virtual root is the only node with a chain of length 1 —
   * the discriminator for "the click landed on the root", which a name test
   * cannot do because a NULL grouping column renders a real node named ""
   * (#1596).
   */
  treePathInfo?: { name?: string }[];
}

export interface ChartSize {
  width: number;
  height: number;
}

export interface LineChartDataPoint {
  /**
   * Never null — `line/transform.ts` coalesces a NULL grouping value to ""
   * (#1655). It can still be a `boolean` when the x column is boolean, since
   * `normalizeValue` returns one; that mismatch is laundered by the
   * `as LineChartDataPoint[]` cast at the plugin boundary and is not fixed
   * here — typing the plugin pipeline end to end is separate work.
   */
  x: string | number;
  /**
   * Series cells may be `null`: the transforms use `toSeriesNumber`, which
   * keeps "no measurement" distinct from a real zero, and ECharts renders a
   * null as a gap (bridged only by `connectNulls`).
   */
  [series: string]: string | number | null;
}

export interface BarChartDataPoint {
  label: string;
  /** See LineChartDataPoint — series cells may be null, `label` may not. */
  [series: string]: string | number | null;
}

export interface PieChartDataPoint {
  name: string;
  value: number;
}

export interface GraphNode {
  id: string;
  label?: string;
  /** Neo4j node labels (e.g. ["Person", "Actor"]) */
  labels?: string[];
  value?: number;
  category?: number;
  properties?: Record<string, unknown>;
  color?: string;
  fixed?: boolean;
  x?: number;
  y?: number;
  /**
   * True for a node that the query computed rather than the database stored —
   * an APOC virtual node (`apoc.create.vNode`). It exists only in this result,
   * so it can be rendered but never expanded (#1361).
   */
  synthetic?: boolean;
}

export interface GraphEdge {
  id?: string;
  source: string;
  target: string;
  label?: string;
  value?: number;
  properties?: Record<string, unknown>;
  color?: string;
}

export interface GraphNodeEvent {
  node: GraphNode;
  position: { x: number; y: number };
}

export interface GraphEdgeEvent {
  edge: GraphEdge;
  position: { x: number; y: number };
}

/** Union type for inspected graph elements (node or edge) */
export type InspectedGraphElement =
  { type: "node"; node: GraphNode } | { type: "edge"; edge: GraphEdge };
