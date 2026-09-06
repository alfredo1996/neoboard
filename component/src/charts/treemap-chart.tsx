import { useMemo } from "react";
import * as echarts from "echarts/core";
import { TreemapChart as ETreemapChart } from "echarts/charts";
import { TitleComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";
import { BaseChart, useDarkMode, resolveSeriesPalette } from "./base-chart";
import type { BaseChartProps } from "./types";
import { useContainerSize } from "@/hooks/useContainerSize";
import {
  buildEmptyDataOption,
  resolveItemColor,
  fillLabelStyle,
  formatNumber,
  contrastTextColor,
} from "./chart-utils";
import { SURFACE_COLOR, MUTED_FILL } from "./theme";
import type { StylingRule } from "./styling-rule";

echarts.use([ETreemapChart, TitleComponent, TooltipComponent, CanvasRenderer]);

export interface TreemapDataItem {
  name: string;
  value?: number;
  children?: TreemapDataItem[];
  /**
   * Query columns ride along on each node (#1601) and the chart adds ECharts
   * per-datum keys such as `itemStyle` and `label`, so a node carries more
   * than the three fields the chart itself reads — the same shape
   * `GanttDataItem` declares.
   */
  [key: string]: unknown;
}

export interface TreemapChartProps extends Omit<BaseChartProps, "options"> {
  /** Hierarchical or flat data for the treemap */
  data: TreemapDataItem[];
  /** Show labels inside rectangles */
  showLabels?: boolean;
  /** Show numeric values inside rectangles */
  showValues?: boolean;
  /** Rule-based styling rules */
  stylingRules?: StylingRule[];
  /** Resolved parameter values for parameterRef comparisons */
  paramValues?: Record<string, unknown>;
}

/**
 * Treemap chart for visualizing hierarchical data as nested rectangles.
 * Accepts `data` as `[{ name, value, children?: [...] }]`.
 *
 * Adapts to container size:
 * - Below 300px: hides breadcrumb and labels
 */
function TreemapChart({
  data,
  showLabels = true,
  showValues = false,
  stylingRules,
  paramValues,
  ariaDescription,
  onClick,
  colorPalette,
  ...rest
}: TreemapChartProps) {
  const { width, height, containerRef } = useContainerSize();
  const compact = width > 0 && (width < 300 || height < 200);

  // The empty-state colour comes from the theme, so this memo has to
  // rebuild on a toggle — a DOM read inside it froze at mount (#1286).
  const dark = useDarkMode();

  const options = useMemo((): EChartsOption => {
    if (!data.length) return buildEmptyDataOption(dark);

    // A group tile owns a hue; its children inherit it. Beyond the third
    // group a hue stops identifying anything, so the rest share one quiet
    // fill and the label does the work. Assigned per datum because ECharts
    // loops a short `color` array (loop is hard-coded), which is how 20-30
    // flat tiles ended up cycling the palette three times (#1405).
    const palette = resolveSeriesPalette(colorPalette);
    const muted = MUTED_FILL[dark ? "dark" : "light"];
    const hasDepth = data.some((d) => d.children?.length);
    const showCrumb = hasDepth && !compact;

    /**
     * The series label is white with a shadow, which reads on every palette
     * hue. The muted fill is pale in light mode, where white would vanish — so
     * a subtree painted muted takes a contrast-picked label instead, and every
     * other subtree is left exactly as it was (#1405).
     */
    const darkenLabels = (node: TreemapDataItem): TreemapDataItem => ({
      ...node,
      label: {
        ...((node as { label?: Record<string, unknown> }).label ?? {}),
        color: contrastTextColor(muted),
        textShadowBlur: 0,
      },
      ...(node.children?.length
        ? { children: node.children.map(darkenLabels) }
        : {}),
    });

    const tiles = data.map((item, i) => {
      const numericValue = typeof item.value === "number" ? item.value : 0;
      const ruleColor = stylingRules?.length
        ? resolveItemColor(numericValue, stylingRules, paramValues)
        : undefined;
      // Flat data is one hue: with no grouping to name, a different colour per
      // tile encodes nothing, and area already carries the value.
      const isMuted = hasDepth && i >= 3 && !ruleColor;
      const fill =
        ruleColor ?? (hasDepth ? (i < 3 ? palette[i] : muted) : palette[0]);
      const painted = {
        ...item,
        itemStyle: {
          ...((item as { itemStyle?: Record<string, unknown> }).itemStyle ??
            {}),
          color: fill,
        },
      };
      return isMuted ? darkenLabels(painted) : painted;
    });

    const labelFormatter = showValues
      ? (p: { name?: string; value?: unknown }) => {
          const v =
            typeof p.value === "number"
              ? formatNumber(p.value, { numberFormat: "comma" })
              : String(p.value ?? "");
          return `${p.name ?? ""}: ${v}`;
        }
      : "{b}";

    return {
      tooltip: {
        formatter: (params: unknown) => {
          const p = params as {
            name: string;
            value: unknown;
            treePathInfo?: Array<{ name: string }>;
          };
          // treePathInfo starts at the synthesized virtual root, whose name is
          // empty — joining it put a leading " / " on every tooltip (#1405).
          const names = (p.treePathInfo ?? [])
            .slice(1)
            .map((t) => echarts.format.encodeHTML(t.name));
          const path = names.length
            ? names.join(" / ")
            : echarts.format.encodeHTML(p.name);
          const value =
            typeof p.value === "number"
              ? formatNumber(p.value, { numberFormat: "comma" })
              : String(p.value ?? "");
          return `<b>${echarts.format.encodeHTML(value)}</b><br/>${path}`;
        },
      },
      series: [
        {
          type: "treemap",
          // A configured click action owns the click: drilling as well would
          // fire the action and move the view at once (#1596). Without an
          // action, native drill is unchanged.
          nodeClick: onClick ? (false as const) : ("zoomToNode" as const),
          // Edges only. ECharts' box layout drops `right`/`bottom` as soon as
          // `width`/`height` are supplied, leaving the series' default 20px
          // left and 50px top insets in place — so the box ran 20px past the
          // right edge and 50px past the bottom, clipping tiles (#1405).
          left: 0,
          top: 0,
          right: 0,
          bottom: showCrumb ? 28 : 0,
          data: tiles,
          roam: false,
          breadcrumb: { show: showCrumb, bottom: 0, height: 22 },
          label: {
            show: showLabels && !compact,
            position: "insideTopLeft",
            // Truncate at the tile edge with an ellipsis instead of breaking
            // mid-word ("Vintage K…"); the tooltip reveals the full name (#1053).
            overflow: "truncate",
            ellipsis: "…",
            formatter: labelFormatter,
            // White + soft shadow: crisp on saturated cells, readable on pale ones.
            ...fillLabelStyle,
          },
          // Deliberately at series level, not per level: it is depth-agnostic,
          // and levels[0] already scopes the root out. Moving it into
          // levels[1]/[2] would silently drop the header on any group deeper
          // than that (#1405).
          upperLabel: {
            show: true,
            height: 22,
            ...fillLabelStyle,
            // The header band sits in the gap, which is painted the card's own
            // colour — so it contrasts with the surface, not with the tile.
            // Inheriting the tiles' white label left every group header
            // invisible in light mode (#1405).
            color: contrastTextColor(SURFACE_COLOR[dark ? "dark" : "light"]),
            textShadowBlur: 0,
          },
          // Tiles are separated by a gap in the card's own colour, so the
          // separation reads as the surface showing through rather than grey
          // rules drawn over the data.
          itemStyle: {
            borderWidth: 0,
            gapWidth: 2,
            borderColor: SURFACE_COLOR[dark ? "dark" : "light"],
          },
          levels: [
            { itemStyle: { gapWidth: 2 }, upperLabel: { show: false } },
            { itemStyle: { gapWidth: 2 } },
            { itemStyle: { gapWidth: 1 } },
          ],
        },
      ],
    };
  }, [
    data,
    showLabels,
    showValues,
    colorPalette,
    compact,
    stylingRules,
    paramValues,
    dark,
    // Read above to decide nodeClick: without it the chart keeps whichever
    // drill setting it had at mount (the #1546/#1562 latch).
    onClick,
  ]);

  return (
    <div ref={containerRef} className="h-full w-full">
      <BaseChart
        options={options}
        ariaDescription={
          ariaDescription ?? `Treemap with ${data.length} top-level items`
        }
        onClick={onClick}
        {...rest}
      />
    </div>
  );
}

export { TreemapChart };
