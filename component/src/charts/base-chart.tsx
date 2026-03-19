import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts/core";
import { BarChart as EBarChart, LineChart as ELineChart, PieChart as EPieChart, GraphChart as EGraphChart, RadarChart as ERadarChart } from "echarts/charts";
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  DataZoomComponent,
  AriaComponent,
  RadarComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";
import { cn } from "@/lib/utils";
import type { BaseChartProps, EChartsClickEvent } from "./types";
import {
  registerNeoboardThemes,
  THEME_LIGHT,
  THEME_DARK,
  DEEP_OCEAN_LIGHT,
} from "./theme";
import { getPaletteColors } from "./palettes";

echarts.use([
  EBarChart,
  ELineChart,
  EPieChart,
  EGraphChart,
  ERadarChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  DataZoomComponent,
  AriaComponent,
  RadarComponent,
  CanvasRenderer,
]);

// Register NeoBoard themes once at module load
registerNeoboardThemes(echarts.registerTheme);

/**
 * Convert space-separated HSL values (e.g. "12 76% 61%") to
 * comma-separated format that ECharts' canvas color parser understands.
 * CSS var() is a DOM-only feature and does not work in canvas 2D context.
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

const CHART_COLOR_VARS = [
  "--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5",
  "--chart-6", "--chart-7", "--chart-8", "--chart-9", "--chart-10",
];
const CHART_COLORS_FALLBACK = DEEP_OCEAN_LIGHT;

/** Detect whether the document is currently in dark mode. */
function isDarkMode(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

/** Watch the `dark` class on `<html>` and re-render when it toggles. */
function useDarkMode(): boolean {
  const [dark, setDark] = useState(isDarkMode);

  useEffect(() => {
    const el = document.documentElement;
    const observer = new MutationObserver(() => setDark(el.classList.contains("dark")));
    observer.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return dark;
}

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
  colorblindMode = false,
  colorPalette,
}: BaseChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const dark = useDarkMode();

  // Initialize / dispose ECharts instance — reinit when dark mode toggles
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const themeName = dark ? THEME_DARK : THEME_LIGHT;
    const instance = echarts.init(el, themeName, {
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
  }, [dark]);

  // Update options
  useEffect(() => {
    const instance = chartRef.current;
    if (!instance || !options) return;

    // Resolve chart colors: use a custom palette when provided (and not deep-ocean),
    // otherwise fall back to CSS-variable-based colors (theme default).
    const paletteColors =
      colorPalette && colorPalette !== "deep-ocean"
        ? getPaletteColors(colorPalette)
        : undefined;
    const resolvedColors = paletteColors ?? resolveChartColors();

    const userAria = (options?.aria ?? {}) as Record<string, unknown>;
    const userDecal = (userAria.decal ?? {}) as Record<string, unknown>;
    const merged: EChartsOption = {
      color: resolvedColors,
      ...options,
      aria: {
        enabled: true,
        ...userAria,
        decal: { show: colorblindMode, ...userDecal },
      },
    };
    instance.setOption(merged, { notMerge: true });
  }, [options, colorblindMode, colorPalette, dark]);

  // Loading state
  useEffect(() => {
    const instance = chartRef.current;
    if (!instance) return;
    if (loading) {
      instance.showLoading("default", {
        text: "",
        maskColor: dark
          ? "rgba(10, 15, 30, 0.6)"
          : "rgba(255, 255, 255, 0.6)",
        zlevel: 0,
      });
    } else {
      instance.hideLoading();
    }
  }, [loading, dark]);

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
  }, [onClick, onDataZoom, dark]);

  if (error) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive",
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
      className={cn("h-full w-full", className)}
      data-testid="base-chart"
      aria-label="Chart visualization"
    />
  );
}

export { BaseChart, CHART_COLORS_FALLBACK as CHART_COLORS, resolveChartColors, useDarkMode };
