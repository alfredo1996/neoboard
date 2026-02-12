import { useEffect, useRef } from "react";
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

/**
 * Resolve CSS custom property chart colors into actual hsl() strings
 * that the ECharts canvas renderer can parse.
 * CSS var() is a DOM-only feature and does not work in canvas 2D context.
 */
/**
 * Convert space-separated HSL values (e.g. "12 76% 61%") to
 * comma-separated format that ECharts' canvas color parser understands.
 */
function hslToComma(hslValues: string): string {
  const parts = hslValues.trim().split(/\s+/);
  if (parts.length >= 3) return `hsl(${parts[0]}, ${parts[1]}, ${parts[2]})`;
  return `hsl(${hslValues})`;
}

function resolveChartColors(): string[] {
  if (typeof document === "undefined") return CHART_COLORS_FALLBACK;
  const styles = getComputedStyle(document.documentElement);
  return CHART_COLOR_VARS.map((varName, i) => {
    const value = styles.getPropertyValue(varName).trim();
    return value ? hslToComma(value) : CHART_COLORS_FALLBACK[i];
  });
}

const CHART_COLOR_VARS = ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5"];
const CHART_COLORS_FALLBACK = [
  "hsl(12, 76%, 61%)",
  "hsl(173, 58%, 39%)",
  "hsl(197, 37%, 24%)",
  "hsl(43, 74%, 66%)",
  "hsl(27, 87%, 67%)",
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
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  // Initialize / dispose ECharts instance
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const instance = echarts.init(el, undefined, {
      renderer: "canvas",
    });
    chartRef.current = instance;
    onChartReady?.(instance);

    // Use ResizeObserver to handle container size changes
    const ro = new ResizeObserver(() => {
      instance.resize();
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
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
      color: resolveChartColors(),
      ...options,
    };
    instance.setOption(merged, { notMerge: true });
  }, [options]);

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
      ref={containerRef}
      className={cn("h-full w-full min-h-[300px]", className)}
      data-testid="base-chart"
    />
  );
}

export { BaseChart, CHART_COLORS_FALLBACK as CHART_COLORS, resolveChartColors };
