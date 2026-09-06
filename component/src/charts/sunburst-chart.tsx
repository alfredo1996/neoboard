import { useMemo } from "react";
import * as echarts from "echarts/core";
import { SunburstChart as ESunburstChart } from "echarts/charts";
import { TitleComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";
import { BaseChart, useDarkMode } from "./base-chart";
import type { BaseChartProps } from "./types";
import { useContainerSize } from "@/hooks/useContainerSize";
import {
  buildEmptyDataOption,
  resolveItemColor,
  FILL_LABEL_COLOR,
  FILL_LABEL_SHADOW,
  FILL_LABEL_SHADOW_BLUR,
  fillLabelStyle,
} from "./chart-utils";
import type { StylingRule } from "./styling-rule";

echarts.use([ESunburstChart, TitleComponent, TooltipComponent, CanvasRenderer]);

export interface SunburstDataItem {
  name: string;
  value?: number;
  children?: SunburstDataItem[];
}

export interface SunburstChartProps extends Omit<BaseChartProps, "options"> {
  /** Hierarchical data for the sunburst chart */
  data: SunburstDataItem[];
  /** Show segment labels */
  showLabels?: boolean;
  /** Maximum depth at which labels are shown (1 = only first ring, 2 = first two, etc.). 0 or undefined = auto (show first 2 levels). */
  maxLabelDepth?: number;
  /** Sort order for segments */
  sort?: "desc" | "asc" | "none";
  /** Highlight segments on hover */
  highlightOnHover?: boolean;
  /** Rule-based styling rules */
  stylingRules?: StylingRule[];
  /** Resolved parameter values for parameterRef comparisons */
  paramValues?: Record<string, unknown>;
}

/**
 * Sunburst chart for displaying hierarchical data as nested arcs.
 * Accepts `data` as a tree: `[{ name, value, children: [...] }]`.
 */
function SunburstChart({
  data,
  showLabels = true,
  maxLabelDepth,
  sort = "desc",
  highlightOnHover = true,
  stylingRules,
  paramValues,
  ariaDescription,
  onClick,
  ...rest
}: SunburstChartProps) {
  const { width, height, containerRef } = useContainerSize();
  const compact = width > 0 && (width < 250 || height < 200);

  // The empty-state colour comes from the theme, so this memo has to
  // rebuild on a toggle — a DOM read inside it froze at mount (#1286).
  const dark = useDarkMode();

  // A single top-level node is a container, not a ring: showing it would paint
  // every arc as tints of one hue. Circle packing unwraps the same way; the
  // transform keeps the root because circle packing uses its name as the first
  // breadcrumb crumb.
  const displayedRings =
    data.length === 1 && data[0].children?.length ? data[0].children : data;

  const options = useMemo((): EChartsOption => {
    if (!data.length) return buildEmptyDataOption(dark);

    const rings = displayedRings;

    // Sort function for echarts sunburst
    const sortFn =
      sort === "none" ? undefined : sort === "asc" ? "asc" : "desc";

    // Determine how deep labels should display.
    // 0 / undefined / null → auto (default 2). Positive integer = exact depth.
    const labelDepth =
      typeof maxLabelDepth === "number" &&
      Number.isFinite(maxLabelDepth) &&
      maxLabelDepth > 0
        ? Math.floor(maxLabelDepth)
        : 2;
    const canShowLabel = (depth: number) =>
      showLabels && !compact && depth <= labelDepth;

    // Walk the tree to find max depth and count nodes at each level
    const countByLevel: number[] = [];
    const walk = (items: SunburstDataItem[], depth: number) => {
      countByLevel[depth] = (countByLevel[depth] ?? 0) + items.length;
      for (const item of items) {
        if (item.children?.length) walk(item.children, depth + 1);
      }
    };
    walk(rings, 1);
    const dataDepth = countByLevel.length - 1;

    // Level 0 = root (center), level 1 = first ring, etc.
    // Labels beyond maxLabelDepth are rendered but invisible (transparent)
    // so that emphasis can reveal them along the ancestor path on hover.
    const levels: Record<string, unknown>[] = [{}]; // root
    for (let i = 1; i <= dataDepth; i++) {
      const count = countByLevel[i] ?? 0;
      const withinDepth = canShowLabel(i);
      // Always use radial rotation when dense — it packs tighter
      const rotation = count > 6 ? "radial" : "tangential";
      // Scale font down progressively as rings get more crowded
      const fontSize = count > 20 ? 9 : count > 12 ? 10 : i === 1 ? 12 : 11;
      // Narrower truncation width for crowded rings
      const width = count > 12 ? 50 : rotation === "tangential" ? 100 : 70;
      levels.push({
        ...(i === 1 ? { itemStyle: { borderWidth: 2 } } : {}),
        label: {
          // Hide labels outside the visible depth band. emphasis.label.show
          // is true (see below), so hovering reveals them on demand. Text
          // color is intentionally omitted — theme.ts provides it via the
          // global textStyle.color (light/dark aware).
          show: showLabels && !compact && withinDepth,
          rotate: rotation,
          overflow: "truncate",
          ellipsis: "…",
          width,
          fontSize: withinDepth ? fontSize : 10,
          // White + soft shadow so segment labels read on any fill color;
          // hidden levels stay fully transparent (no ghost shadow).
          color: withinDepth ? FILL_LABEL_COLOR : "transparent",
          textShadowColor: FILL_LABEL_SHADOW,
          textShadowBlur: withinDepth ? FILL_LABEL_SHADOW_BLUR : 0,
        },
      });
    }

    return {
      tooltip: {
        trigger: "item",
        formatter: (params: unknown) => {
          const p = params as { name: string; value: unknown };
          return `${echarts.format.encodeHTML(p.name)}: ${echarts.format.encodeHTML(String(p.value ?? ""))}`;
        },
      },
      series: [
        {
          type: "sunburst",
          // A configured click action owns the click: drilling as well would
          // fire the action and move the view at once (#1596). Without an
          // action, native drill is unchanged.
          nodeClick: onClick ? (false as const) : ("rootToNode" as const),
          data: stylingRules?.length
            ? rings.map((item) => {
                const numericValue =
                  typeof item.value === "number" ? item.value : 0;
                const resolvedColor = resolveItemColor(
                  numericValue,
                  stylingRules,
                  paramValues,
                );
                return {
                  ...item,
                  itemStyle: {
                    ...((item as { itemStyle?: Record<string, unknown> })
                      .itemStyle ?? {}),
                    ...(resolvedColor ? { color: resolvedColor } : {}),
                  },
                };
              })
            : rings,
          center: ["50%", "50%"],
          radius: ["10%", "92%"],
          sort: sortFn as "desc" | "asc" | undefined,
          label: {
            show: !compact,
            fontSize: 11,
            ...fillLabelStyle,
          },
          emphasis: highlightOnHover
            ? {
                focus: "ancestor",
                label: {
                  show: true,
                  fontSize: 12,
                  fontWeight: "bold" as const,
                  ...fillLabelStyle,
                },
                itemStyle: {
                  shadowBlur: 4,
                  shadowOffsetX: 0,
                  shadowColor: "rgba(0, 0, 0, 0.15)",
                },
              }
            : {},
          levels,
        },
      ],
    };
  }, [
    data,
    showLabels,
    maxLabelDepth,
    sort,
    highlightOnHover,
    compact,
    stylingRules,
    paramValues,
    dark,
    displayedRings,
    // Read above to decide nodeClick: without it the chart keeps whichever
    // drill setting it had at mount (the #1546/#1562 latch).
    onClick,
  ]);

  return (
    <div ref={containerRef} className="h-full w-full">
      <BaseChart
        options={options}
        ariaDescription={
          ariaDescription ??
          `Sunburst chart with ${displayedRings.length} top-level segments`
        }
        onClick={onClick}
        {...rest}
      />
    </div>
  );
}

export { SunburstChart };
