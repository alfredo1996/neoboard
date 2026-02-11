import { useEffect, useRef, useCallback } from "react";
import * as echarts from "echarts/core";
import { BarChart as EBarChart, LineChart as ELineChart, PieChart as EPieChart, GraphChart as EGraphChart } from "echarts/charts";
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  DataZoomComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";
import { useContainerSize } from "@/hooks/useContainerSize";
import { cn } from "@/lib/utils";
import type { BaseChartProps, EChartsClickEvent } from "./types";

echarts.use([
  EBarChart,
  ELineChart,
  EPieChart,
  EGraphChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  DataZoomComponent,
  CanvasRenderer,
]);

/** Default chart color palette using CSS custom properties */
const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

/**
 * Base chart wrapper that initializes ECharts, handles resizing,
 * theming, loading/error states, and event forwarding.
 */
function BaseChart({
  options,
  loading = false,
  error = null,
  className,
  onChartReady,
  onClick,
  onDataZoom,
}: BaseChartProps) {
  const [containerRef, { width, height }] = useContainerSize();
  const chartRef = useRef<echarts.ECharts | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // Sync container ref for useContainerSize
  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      chartContainerRef.current = node;
    },
    [containerRef],
  );

  // Initialize / dispose ECharts instance
  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;

    const instance = echarts.init(el);
    chartRef.current = instance;
    onChartReady?.(instance);

    return () => {
      instance.dispose();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update options
  useEffect(() => {
    const instance = chartRef.current;
    if (!instance || !options) return;

    const merged: EChartsOption = {
      color: CHART_COLORS,
      ...options,
    };
    instance.setOption(merged, { notMerge: true });
  }, [options]);

  // Resize on container size change
  useEffect(() => {
    const instance = chartRef.current;
    if (!instance || width === 0 || height === 0) return;
    instance.resize({ width, height });
  }, [width, height]);

  // Loading state
  useEffect(() => {
    const instance = chartRef.current;
    if (!instance) return;
    if (loading) {
      instance.showLoading("default", {
        text: "",
        maskColor: "rgba(255, 255, 255, 0.6)",
        zlevel: 0,
      });
    } else {
      instance.hideLoading();
    }
  }, [loading]);

  // Event handlers
  useEffect(() => {
    const instance = chartRef.current;
    if (!instance) return;

    if (onClick) {
      instance.on("click", (params: unknown) => onClick(params as EChartsClickEvent));
    }
    if (onDataZoom) {
      instance.on("dataZoom", onDataZoom);
    }

    return () => {
      instance.off("click");
      instance.off("dataZoom");
    };
  }, [onClick, onDataZoom]);

  if (error) {
    return (
      <div
        className={cn(
          "flex min-h-[300px] items-center justify-center rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive",
          className,
        )}
        role="alert"
      >
        {error.message}
      </div>
    );
  }

  return (
    <div
      ref={setRefs}
      className={cn("min-h-[300px] w-full", className)}
      data-testid="base-chart"
    />
  );
}

export { BaseChart, CHART_COLORS };
