import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts/core";
import {
  BarChart as EBarChart,
  LineChart as ELineChart,
  PieChart as EPieChart,
  RadarChart as ERadarChart,
} from "echarts/charts";
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  DataZoomComponent,
  AriaComponent,
  RadarComponent,
  MarkLineComponent,
  GraphicComponent,
} from "echarts/components";
import { CanvasRenderer, SVGRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";
import { cn } from "@/lib/utils";
import type { BaseChartProps, EChartsClickEvent } from "./types";
import {
  registerNeoboardThemes,
  THEME_LIGHT,
  THEME_DARK,
  CITRINE_LIGHT,
} from "./theme";
import { getPaletteColors, resolvePaletteId } from "./palettes";

echarts.use([
  EBarChart,
  ELineChart,
  EPieChart,
  ERadarChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  DataZoomComponent,
  AriaComponent,
  RadarComponent,
  MarkLineComponent,
  GraphicComponent,
  CanvasRenderer,
  SVGRenderer,
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

/**
 * The series colours a chart should paint with.
 *
 * A chosen palette is a static, light-only array, so only non-default palettes
 * take it. The citrine default (and its "deep-ocean" alias) go through the CSS
 * variables instead, which carry the dark-mode values — gating on the alias
 * alone left every default chart painting light citrine on the dark canvas
 * (#1295).
 *
 * Exported because a chart that assigns colours inside its own option — the
 * treemap maps a hue per top-level group — must follow the same rule rather
 * than reimplementing it (#1405).
 */
export function resolveSeriesPalette(colorPalette?: string): string[] {
  const paletteColors =
    colorPalette && resolvePaletteId(colorPalette) !== "citrine"
      ? getPaletteColors(colorPalette)
      : undefined;
  return paletteColors ?? resolveChartColors();
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
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
  "--chart-6",
  "--chart-7",
  "--chart-8",
  "--chart-9",
  "--chart-10",
];
const CHART_COLORS_FALLBACK = CITRINE_LIGHT;

/** Detect whether the document is currently in dark mode. */
function isDarkMode(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

/**
 * Reactive dark-mode hook that listens to theme changes via:
 * 1. `<html class="dark">` mutations — the ground truth `isDarkMode` reads
 * 2. `neoboard-theme-change` custom event (dispatched by the app's useTheme)
 * 3. OS `prefers-color-scheme` media query changes
 * 4. `storage` events (cross-tab theme sync)
 *
 * (1) is the catch-all that makes the rest of the docstring's promise true —
 * the chart re-themes for any host that toggles the class, whether or not it
 * is NeoBoard's useTheme. (2)–(4) are kept because they land synchronously,
 * ahead of the observer's microtask.
 */
function useDarkMode(): boolean {
  const [dark, setDark] = useState(isDarkMode);

  useEffect(() => {
    const sync = () => setDark(isDarkMode());

    // Any theme library toggling `<html class="dark">` — Storybook's theme
    // toolbar, next-themes, a manual toggle. Without this the chart keeps the
    // theme it mounted with: light-theme labels (#14161a) on a dark canvas.
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    // App-level theme change event (NeoBoard's useTheme dispatches this)
    globalThis.addEventListener("neoboard-theme-change", sync);
    // Cross-tab sync (localStorage theme key changed in another tab)
    globalThis.addEventListener("storage", sync);
    // OS-level dark mode toggle
    const mql = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
    mql?.addEventListener("change", sync);

    return () => {
      observer.disconnect();
      globalThis.removeEventListener("neoboard-theme-change", sync);
      globalThis.removeEventListener("storage", sync);
      mql?.removeEventListener("change", sync);
    };
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
  enableDataZoom = false,
  ariaDescription,
  colorblindMode = false,
  colorPalette,
}: BaseChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const dark = useDarkMode();
  // Surfaced when setOption() throws on malformed data (see the update effect).
  const [renderError, setRenderError] = useState<Error | null>(null);

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

    // Resolve chart colors: a chosen palette is a static, light-only array, so
    // only non-default palettes take it — see resolveSeriesPalette.
    const resolvedColors = resolveSeriesPalette(colorPalette);

    const userAria = (options?.aria ?? {}) as Record<string, unknown>;
    const userDecal = (userAria.decal ?? {}) as Record<string, unknown>;
    const merged: EChartsOption = {
      color: resolvedColors,
      ...options,
      ...(enableDataZoom
        ? {
            dataZoom: [
              { type: "inside", xAxisIndex: 0 },
              { type: "inside", yAxisIndex: 0 },
            ],
          }
        : {}),
      aria: {
        enabled: true,
        ...userAria,
        ...(ariaDescription ? { label: { description: ariaDescription } } : {}),
        decal: { show: colorblindMode, ...userDecal },
      },
    };
    try {
      instance.setOption(merged, { notMerge: true });
      // Fix blank render on initial widget placement: if the container was
      // 0x0 when ECharts initialized, the first setOption draws to a 0x0
      // canvas. Force a resize after setOption so it picks up the real size.
      instance.resize();
      setRenderError(null);
    } catch (err) {
      // ECharts throws synchronously on malformed data — a Sankey with a cyclic
      // flow, duplicate node names, or a link to a missing node (all reachable
      // from ordinary Neo4j/PG results). Clear the half-drawn chart and surface
      // the error instead of letting the throw crash the whole widget. The
      // inline overlay is the better UX: ChartErrorBoundary
      // (app/src/components/chart-renderer.tsx) already stops a throw from
      // taking down the dashboard, but it replaces the widget with a generic
      // card that names neither the chart nor the cause.
      instance.clear();
      setRenderError(err instanceof Error ? err : new Error(String(err)));
    }
  }, [
    options,
    enableDataZoom,
    colorblindMode,
    colorPalette,
    dark,
    ariaDescription,
  ]);

  // Loading state
  useEffect(() => {
    const instance = chartRef.current;
    if (!instance) return;
    if (loading) {
      instance.showLoading("default", {
        text: "",
        maskColor: dark ? "rgba(10, 15, 30, 0.6)" : "rgba(255, 255, 255, 0.6)",
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
      instance.on("click", (params: unknown) =>
        onClick(params as EChartsClickEvent),
      );
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

  // The container stays mounted (so the ECharts instance keeps its DOM binding)
  // even when a render error occurs — the error is shown as an overlay on top.
  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        className={cn(
          "h-full w-full rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          className,
        )}
        data-testid="base-chart"
        role="img"
        aria-label={ariaDescription ?? "Chart visualization"}
        tabIndex={0}
      />
      {renderError && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-md border border-destructive/50 bg-destructive/10 p-4 text-center text-sm text-destructive"
          role="alert"
        >
          <span className="font-medium">Chart failed to render</span>
          <span className="text-xs">{renderError.message}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Export an ECharts chart to SVG by creating an offscreen instance with the
 * SVG renderer and the same options as the visible chart.
 *
 * @param container - The DOM element containing the ECharts canvas
 * @returns SVG string or null if the chart instance can't be found
 */
function exportChartToSvg(container: HTMLElement): string | null {
  const instance = echarts.getInstanceByDom(container);
  if (!instance) return null;

  const options = instance.getOption();
  const rect = instance.getDom().getBoundingClientRect();
  // Round to integers — some SVG viewers handle fractional dimensions inconsistently
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);

  const offscreen = document.createElement("div");
  offscreen.style.width = `${width}px`;
  offscreen.style.height = `${height}px`;
  offscreen.style.position = "absolute";
  offscreen.style.left = "-9999px";
  document.body.appendChild(offscreen);

  let svgInstance: ReturnType<typeof echarts.init> | null = null;
  try {
    const themeName = isDarkMode() ? THEME_DARK : THEME_LIGHT;
    svgInstance = echarts.init(offscreen, themeName, {
      renderer: "svg",
      width,
      height,
    });
    svgInstance.setOption(options);

    const svgEl = offscreen.querySelector("svg");
    if (!svgEl) return null;

    return new XMLSerializer().serializeToString(svgEl);
  } finally {
    // dispose-in-finally guarantees no leak on any throw path
    if (svgInstance) svgInstance.dispose();
    document.body.removeChild(offscreen);
  }
}

/**
 * Export an ECharts chart to a PNG data URL by reading from the existing
 * canvas-rendered instance. Background matches the current theme so the
 * exported image looks like what's on screen.
 *
 * @returns PNG data URL (image/png) or null if the chart instance can't be found
 */
function exportChartToPng(container: HTMLElement): string | null {
  const instance = echarts.getInstanceByDom(container);
  if (!instance) return null;
  const backgroundColor = isDarkMode() ? "#0a0f1e" : "#ffffff";
  return instance.getDataURL({
    type: "png",
    pixelRatio: 2,
    backgroundColor,
  });
}

export {
  BaseChart,
  CHART_COLORS_FALLBACK as CHART_COLORS,
  resolveChartColors,
  useDarkMode,
  exportChartToSvg,
  exportChartToPng,
};
