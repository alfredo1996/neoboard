import { useCallback, useMemo, useState } from "react";
import * as echarts from "echarts/core";
import { SunburstChart as ESunburstChart } from "echarts/charts";
import {
  GraphicComponent,
  TitleComponent,
  TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";
import { BaseChart, useDarkMode, resolveSeriesPalette } from "./base-chart";
import type { BaseChartProps, EChartsClickEvent } from "./types";
import { useContainerSize } from "@/hooks/useContainerSize";
import {
  buildEmptyDataOption,
  formatNumber,
  resolveItemColor,
} from "./chart-utils";
import { INK, SURFACE_COLOR } from "./theme";
import {
  drillAfterClick,
  paintTree,
  resolveDrill,
  sumValue,
  viewOf,
  type PaintedNode,
} from "./sunburst-view";
import type { StylingRule } from "./styling-rule";

echarts.use([
  ESunburstChart,
  GraphicComponent,
  TitleComponent,
  TooltipComponent,
  CanvasRenderer,
]);

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
  /** What the centre total counts ("revenue", "orders"). Defaults to "Total". */
  valueLabel?: string;
}

const EDGE_SHARES: Record<number, number[]> = {
  1: [1],
  2: [0.444, 0.556],
};

/** Where each ring ends, as a share of the radius left after the hole. */
function ringEdges(rings: number, hole: number): string[] {
  const span = 92 - hole;
  // The first two rings are the wide ones; any more share what is left.
  const share = EDGE_SHARES[rings] ?? [
    0.389,
    0.389,
    ...new Array<number>(rings - 2).fill(0.222 / (rings - 2)),
  ];
  let edge = hole;
  return [
    `${hole}%`,
    ...share.map((w) => {
      edge += w * span;
      return `${Math.round(edge * 10) / 10}%`;
    }),
  ];
}

/** One ECharts level per ring: its radii, and a label only where one fits. */
function ringLevels(
  edges: string[],
  labelDepth: number,
  labelsOn: boolean,
): Record<string, unknown>[] {
  const levels: Record<string, unknown>[] = [{}];
  for (let i = 1; i < edges.length; i++) {
    const shown = labelsOn && i <= labelDepth;
    let label: Record<string, unknown> = { show: false };
    if (shown) {
      label = {
        rotate: 0,
        fontSize: i === 1 ? 12 : 10.5,
        fontWeight: i === 1 ? 600 : 400,
        // Hidden where the arc is too narrow to hold the name.
        ...(i === 1 ? {} : { minAngle: 12 }),
      };
    }
    levels.push({ r0: edges[i - 1], r: edges[i], label });
  }
  return levels;
}

function depthOf(nodes: PaintedNode[]): number {
  return nodes.length
    ? 1 + Math.max(0, ...nodes.map((n) => depthOf(n.children ?? [])))
    : 0;
}

/**
 * Sunburst chart for displaying hierarchical data as nested arcs.
 * Accepts `data` as a tree: `[{ name, value, children: [...] }]`.
 *
 * Without a click action it shows two rings, a click goes one level down and
 * the centre one level up. With a click action every ring shows and a click
 * runs the action: the two never compete (#1596, #2231).
 */
function SunburstChart({
  data,
  showLabels = true,
  maxLabelDepth,
  sort = "desc",
  highlightOnHover = true,
  stylingRules,
  paramValues,
  valueLabel = "Total",
  ariaDescription,
  onClick,
  colorPalette,
  ...rest
}: SunburstChartProps) {
  const { width, height, containerRef } = useContainerSize();
  const compact = width > 0 && (width < 250 || height < 200);

  // The empty-state colour comes from the theme, so this memo has to
  // rebuild on a toggle — a DOM read inside it froze at mount (#1286).
  const dark = useDarkMode();

  const [drill, setDrill] = useState<string[]>([]);

  // A single top-level node is a container, not a ring: showing it would paint
  // every arc as tints of one hue. Circle packing unwraps the same way; the
  // transform keeps the root because circle packing uses its name as the first
  // breadcrumb crumb.
  const displayedRings =
    data.length === 1 && data[0].children?.length ? data[0].children : data;

  // Painted once on the whole tree, so a node keeps its colour whichever
  // level the view is centred on.
  const painted = useMemo(() => {
    const palette = resolveSeriesPalette(colorPalette);
    const authored = new Set<number>();
    const bases = displayedRings.map((item, i) => {
      const numericValue = typeof item.value === "number" ? item.value : 0;
      const rule = stylingRules?.length
        ? resolveItemColor(numericValue, stylingRules, paramValues)
        : undefined;
      if (rule) authored.add(i);
      return rule ?? palette[i % palette.length];
    });
    return paintTree(
      displayedRings,
      bases,
      SURFACE_COLOR[dark ? "dark" : "light"],
      authored,
    );
  }, [displayedRings, colorPalette, stylingRules, paramValues, dark]);

  const clickAction = onClick !== undefined;

  const handleClick = useCallback(
    (e: EChartsClickEvent) => {
      if (onClick) {
        onClick(e);
        return;
      }
      if (e.componentType !== "series") return;
      const relative = (e.treePathInfo ?? []).slice(1).map((x) => x.name ?? "");
      setDrill((d) =>
        drillAfterClick(painted, resolveDrill(painted, d), relative),
      );
    },
    [onClick, painted],
  );

  const options = useMemo((): EChartsOption => {
    if (!data.length) return buildEmptyDataOption(dark);

    // A path the data no longer has is the overview.
    const effective = clickAction ? [] : resolveDrill(painted, drill);
    const view = viewOf(painted, effective, clickAction ? undefined : 2);
    const rings = depthOf(view);
    const drilled = effective.length > 0;
    const theme = dark ? "dark" : "light";

    const sortFn = sort === "none" ? undefined : sort;

    // 0 / undefined / null → auto (default 2). Positive integer = exact depth.
    const labelDepth =
      typeof maxLabelDepth === "number" &&
      Number.isFinite(maxLabelDepth) &&
      maxLabelDepth > 0
        ? Math.floor(maxLabelDepth)
        : 2;

    // Room for the three-line centre once drilled.
    const hole = drilled ? 34 : 20;
    const edges = ringEdges(rings, hole);
    const levels = ringLevels(edges, labelDepth, showLabels && !compact);

    const total = formatNumber(
      sumValue(viewOf(painted, effective, undefined)),
      { context: "label" },
    );
    const parent = effective.length > 1 ? effective.at(-2) : "back";
    const centre = drilled
      ? `{n|${effective.at(-1)}}\n{a|${total}}\n{c|← ${parent}}`
      : `{a|${total}}\n{b|${valueLabel}}`;
    const radiusPx = (Math.min(width, height) / 2) * (hole / 100);
    const hit = { left: "center", top: "middle" } as const;
    const canGoUp = drilled;

    return {
      tooltip: {
        trigger: "item",
        formatter: (params: unknown) => {
          const p = params as {
            name: string;
            value: unknown;
            treePathInfo?: { name?: string }[];
          };
          const path = [
            ...effective,
            ...(p.treePathInfo ?? []).slice(1).map((x) => x.name ?? ""),
          ];
          const label = (path.length ? path : [p.name])
            .map((x) => echarts.format.encodeHTML(x))
            .join(" › ");
          return `${label}<br/><b>${formatNumber(p.value as number, { context: "tooltip" })}</b>`;
        },
      },
      graphic: [
        {
          type: "text" as const,
          ...hit,
          silent: true,
          z: 10,
          style: {
            text: centre,
            align: "center",
            rich: {
              n: {
                fontSize: 12,
                fontWeight: 600,
                fill: INK[theme].ink,
                align: "center",
                lineHeight: 16,
              },
              a: {
                fontSize: 15,
                fontWeight: 600,
                fill: INK[theme].ink,
                align: "center",
                lineHeight: 18,
              },
              b: { fontSize: 11, fill: INK[theme].ink3, align: "center" },
              c: {
                fontSize: 11,
                fill: INK[theme].ink3,
                align: "center",
                lineHeight: 16,
              },
            },
          },
        },
        {
          // The click target for "up": the whole hole, not just the glyphs.
          type: "circle" as const,
          ...hit,
          silent: !canGoUp,
          cursor: "pointer",
          shape: { r: radiusPx },
          style: { fill: "rgba(0,0,0,0)" },
          onclick: () => setDrill((d) => d.slice(0, -1)),
        },
      ],
      series: [
        {
          type: "sunburst",
          // Drilling is ours (see handleClick); ECharts' own drill would
          // fight a configured click action (#1596) and the two-ring view.
          nodeClick: false as const,
          data: view,
          center: ["50%", "50%"],
          radius: [`${hole}%`, "92%"],
          sort: sortFn,
          label: { show: !compact, fontSize: 11 },
          emphasis: highlightOnHover ? { focus: "ancestor" } : {},
          levels,
        },
      ],
    };
  }, [
    data,
    painted,
    drill,
    clickAction,
    showLabels,
    maxLabelDepth,
    sort,
    highlightOnHover,
    compact,
    valueLabel,
    width,
    height,
    dark,
  ]);

  return (
    <div ref={containerRef} className="h-full w-full">
      <BaseChart
        // A fresh instance per view. ECharts keeps the old hover's blur on
        // every node after a drill replaces the tree under a still pointer,
        // and the chart stays faded until the pointer moves.
        key={clickAction ? "all" : drill.join("\u0000")}
        options={options}
        ariaDescription={
          ariaDescription ??
          `Sunburst chart with ${displayedRings.length} top-level segments`
        }
        onClick={handleClick}
        colorPalette={colorPalette}
        {...rest}
      />
    </div>
  );
}

export { SunburstChart };
