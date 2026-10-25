import { useMemo } from "react";
import * as echarts from "echarts/core";
import { SankeyChart as ESankeyChart } from "echarts/charts";
import { TitleComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";
import { BaseChart, useChartFontReady, useDarkMode } from "./base-chart";
import type { BaseChartProps } from "./types";
import { useContainerSize } from "@/hooks/useContainerSize";
import {
  buildEmptyDataOption,
  formatNumber,
  measureTextWidth,
  resolveItemColor,
} from "./chart-utils";
import {
  FLOW_COLOR,
  HASTINGS_DARK,
  HASTINGS_LIGHT,
  INK,
  SURFACE_COLOR,
} from "./theme";
import type { StylingRule } from "./styling-rule";

/**
 * `name` cut to fit `limit` px beside its value, an ellipsis where it was cut.
 * The name is cut, not the line, so the value at the end always shows (the
 * tooltip has the full name).
 */
function fitName(name: string, value: string, limit: number): string {
  let out = name;
  while (
    out.length > 1 &&
    measureTextWidth(`${out === name ? out : out + "…"} ${value}`, 12) > limit
  ) {
    out = out.slice(0, -1);
  }
  return out === name ? name : out + "…";
}

echarts.use([ESankeyChart, TitleComponent, TooltipComponent, CanvasRenderer]);

export interface SankeyNode {
  name: string;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

export interface SankeyChartData {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

export interface SankeyChartProps extends Omit<BaseChartProps, "options"> {
  /** Sankey data with nodes and links */
  data: SankeyChartData;
  /** Orientation of the flow */
  orient?: "horizontal" | "vertical";
  /** Show node labels */
  showLabels?: boolean;
  /** Node block width in pixels */
  nodeWidth?: number;
  /** Gap between nodes in pixels */
  nodeGap?: number;
  /** Rule-based styling rules */
  stylingRules?: StylingRule[];
  /** Resolved parameter values for parameterRef comparisons */
  paramValues?: Record<string, unknown>;
}

/**
 * Sankey chart for visualizing flow between nodes.
 * Accepts `data` as `{ nodes: [{ name }], links: [{ source, target, value }] }`.
 */
function SankeyChart({
  data,
  orient = "horizontal",
  showLabels = true,
  nodeWidth = 20,
  nodeGap = 8,
  stylingRules,
  paramValues,
  ariaDescription,
  ...rest
}: SankeyChartProps) {
  const { width, height, containerRef } = useContainerSize();
  const compact = width > 0 && (width < 300 || height < 200);

  // The empty-state colour comes from the theme, so this memo has to
  // rebuild on a toggle — a DOM read inside it froze at mount (#1286).
  const dark = useDarkMode();
  // Margins are measured on a canvas in the face as it is then: a dependency
  // of the memo, so they are measured again once the face has loaded.
  const fontReady = useChartFontReady();

  // ECharts keys sankey nodes by name and throws from its layout on a
  // duplicate. A GROUP BY that is not actually unique produces one; the
  // app's transform dedupes, but direct callers and external chart plugins
  // hand nodes over as they are (#1667).
  const nodes = useMemo(() => {
    const seen = new Set<string>();
    return data.nodes.filter((n) =>
      seen.has(n.name) ? false : (seen.add(n.name), true),
    );
  }, [data.nodes]);

  const options = useMemo((): EChartsOption => {
    if (!nodes.length || !data.links.length) return buildEmptyDataOption(dark);

    const theme = dark ? "dark" : "light";
    const horizontal = orient === "horizontal";
    const citrine = (dark ? HASTINGS_DARK : HASTINGS_LIGHT)[0];

    // The first column's labels sit left of the plot and the last column's
    // right of it; ECharts clips what leaves the canvas, so the margins are
    // measured from the labels rather than guessed. A sink is in the last
    // column (the default alignment pushes them there).
    const inTotal = new Map<string, number>();
    const outTotal = new Map<string, number>();
    for (const l of data.links) {
      outTotal.set(l.source, (outTotal.get(l.source) ?? 0) + l.value);
      inTotal.set(l.target, (inTotal.get(l.target) ?? 0) + l.value);
    }
    const widest = (pick: (name: string) => number | undefined) =>
      Math.max(
        0,
        ...nodes.map((n) => {
          const v = pick(n.name);
          return v === undefined
            ? 0
            : measureTextWidth(
                `${n.name} ${formatNumber(v, { context: "label" })}`,
                12,
              );
        }),
      );
    const cap = width > 0 ? width * 0.3 : Number.POSITIVE_INFINITY;
    // Past the cap a label is cut to it, so a long edge name cannot leave the
    // canvas or squeeze the plot.
    const labelLimit =
      horizontal && !compact && width > 0 ? cap - 16 : Number.POSITIVE_INFINITY;
    const margins =
      horizontal && !compact
        ? {
            left: Math.ceil(
              Math.min(
                cap,
                widest((n) => (inTotal.has(n) ? undefined : outTotal.get(n))),
              ) + 16,
            ),
            right: Math.ceil(
              Math.min(
                cap,
                widest((n) => (outTotal.has(n) ? undefined : inTotal.get(n))),
              ) + 16,
            ),
          }
        : {};

    return {
      tooltip: {
        trigger: "item",
        triggerOn: "mousemove",
      },
      series: [
        {
          type: "sankey",
          orient,
          ...margins,
          data: nodes,
          links: stylingRules?.length
            ? data.links.map((link) => {
                const resolvedColor = resolveItemColor(
                  link.value,
                  stylingRules,
                  paramValues,
                );
                return {
                  ...link,
                  lineStyle: resolvedColor ? { color: resolvedColor } : {},
                };
              })
            : data.links,
          nodeWidth: compact ? Math.max(nodeWidth - 4, 10) : nodeWidth,
          nodeGap: compact ? Math.max(nodeGap - 2, 4) : nodeGap,
          itemStyle: { color: INK[theme].ink2, borderWidth: 0 },
          label: {
            show: showLabels && !compact,
            position: horizontal ? "right" : "top",
            fontSize: 12,
            // Halo in the card's colour where a label crosses a flow.
            textBorderColor: SURFACE_COLOR[theme],
            textBorderWidth: 3,
            formatter: (p: { name: string; value?: unknown }) => {
              const value = formatNumber(p.value as number, {
                context: "label",
              });
              return `${fitName(p.name, value, labelLimit)} {v|${value}}`;
            },
            rich: { v: { color: INK[theme].ink3, fontSize: 12 } },
          },
          // The first column reads to the left of its nodes, the rest to
          // the right (#2231).
          levels: horizontal
            ? [{ depth: 0, label: { position: "left" as const } }]
            : [],
          // Visible at rest: 18% grey measured ~1.1:1 against the page.
          lineStyle: {
            color: FLOW_COLOR[theme],
            opacity: 0.5,
            curveness: 0.5,
          },
          emphasis: {
            // The hovered flow's whole path stays; everything else fades.
            focus: "trajectory",
            itemStyle: { color: citrine },
            lineStyle: { color: citrine, opacity: 0.6 },
          },
        },
      ],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fontReady re-measures text once the face loads
  }, [
    nodes,
    data,
    orient,
    showLabels,
    nodeWidth,
    nodeGap,
    compact,
    width,
    stylingRules,
    paramValues,
    dark,
    fontReady,
  ]);

  return (
    <div ref={containerRef} className="h-full w-full">
      <BaseChart
        options={options}
        ariaDescription={
          ariaDescription ??
          `Sankey diagram with ${nodes.length} nodes and ${data.links.length} links`
        }
        {...rest}
      />
    </div>
  );
}

export { SankeyChart };
