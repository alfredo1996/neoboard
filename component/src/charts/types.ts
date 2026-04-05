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
   * Color palette ID from COLOR_PALETTES. When set to a value other than
   * "deep-ocean" (the default), overrides the ECharts theme colors.
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
}

export interface ChartSize {
  width: number;
  height: number;
}

export interface LineChartDataPoint {
  x: string | number;
  [series: string]: string | number;
}

export interface BarChartDataPoint {
  label: string;
  [series: string]: string | number;
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
  | { type: "node"; node: GraphNode }
  | { type: "edge"; edge: GraphEdge };
