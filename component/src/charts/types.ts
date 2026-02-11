import type { EChartsOption } from "echarts";

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
  onChartReady?: (instance: unknown) => void;
  /** Called when a chart element is clicked */
  onClick?: (params: EChartsClickEvent) => void;
  /** Called when data zoom changes */
  onDataZoom?: (params: unknown) => void;
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
  value?: number;
  category?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  label?: string;
  value?: number;
}
