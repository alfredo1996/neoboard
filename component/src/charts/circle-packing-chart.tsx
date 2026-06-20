import { useMemo } from "react";
import * as echarts from "echarts/core";
import { CustomChart } from "echarts/charts";
import { TitleComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";
import { pack, hierarchy, type HierarchyCircularNode } from "d3-hierarchy";
import { BaseChart, useDarkMode } from "./base-chart";
import type { BaseChartProps } from "./types";
import { useContainerSize } from "@/hooks/useContainerSize";
import {
  buildEmptyDataOption,
  resolveItemColor,
  contrastTextColor,
} from "./chart-utils";
import { CITRINE_LIGHT, CITRINE_DARK } from "./theme";
import type { StylingRule } from "./styling-rule";

echarts.use([CustomChart, TitleComponent, TooltipComponent, CanvasRenderer]);

export interface CirclePackingDataItem {
  name: string;
  value?: number;
  children?: CirclePackingDataItem[];
}

export interface CirclePackingChartProps extends Omit<
  BaseChartProps,
  "options"
> {
  /** Hierarchical data: [{ name, value?, children? }] */
  data: CirclePackingDataItem[];
  /** Show labels inside circles */
  showLabels?: boolean;
  /** Padding between sibling circles */
  padding?: number;
  /** Rule-based styling rules */
  stylingRules?: StylingRule[];
  /** Resolved parameter values for parameterRef comparisons */
  paramValues?: Record<string, unknown>;
}

interface PackedNode {
  name: string;
  value: number;
  depth: number;
  x: number;
  y: number;
  r: number;
  color?: string;
}

/** Faint neutral fill for the (label-less) root circle. */
const ROOT_FILL = "rgba(140, 140, 140, 0.08)";

function CirclePackingChart({
  data,
  showLabels = true,
  padding = 3,
  stylingRules,
  paramValues,
  ariaDescription,
  ...rest
}: CirclePackingChartProps) {
  const { width, height, containerRef } = useContainerSize();
  const measured = width > 0;
  const dark = useDarkMode();

  const options = useMemo((): EChartsOption | undefined => {
    // Brand citrine palette, indexed by depth (was a stock ECharts palette).
    const depthColors = dark ? CITRINE_DARK : CITRINE_LIGHT;
    if (!measured) return undefined;
    if (!data.length) return buildEmptyDataOption();

    // Wrap in a virtual root if multiple top-level items
    const root =
      data.length === 1 && data[0].children
        ? data[0]
        : { name: "", value: 0, children: data };

    // Build d3 hierarchy and run circle packing layout
    const h = hierarchy(root)
      .sum((d) => (d.children?.length ? 0 : (d.value ?? 0)))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    const size = Math.min(width, height);
    const packer = pack<CirclePackingDataItem>()
      .size([size, size])
      .padding(padding);

    const packed = packer(h);

    // Flatten the hierarchy into a flat array for ECharts custom series
    const nodes: PackedNode[] = [];
    packed.each((node: HierarchyCircularNode<CirclePackingDataItem>) => {
      const d = node.data;
      const numericValue = node.value ?? 0;
      const resolvedColor =
        stylingRules?.length && numericValue > 0
          ? resolveItemColor(numericValue, stylingRules, paramValues)
          : undefined;

      nodes.push({
        name: d.name,
        value: numericValue,
        depth: node.depth,
        x: node.x,
        y: node.y,
        r: node.r,
        color: resolvedColor,
      });
    });

    // Offset so the packing is centered in the chart area
    const offsetX = (width - size) / 2;
    const offsetY = (height - size) / 2;

    // Deepest level = leaf circles. Parent labels are pinned to the top rim so
    // they don't sit dead-centre under their (centred) child circles.
    const maxDepth = nodes.reduce((m, n) => Math.max(m, n.depth), 0);

    const renderItem = (
      _params: unknown,
      api: {
        value: (dim: number) => number;
        style: () => Record<string, unknown>;
      },
    ) => {
      const cx = api.value(0) + offsetX;
      const cy = api.value(1) + offsetY;
      const r = api.value(2);
      const depth = api.value(3);
      const nodeColor = api.value(5);
      const name = String(api.value(6));
      const kind = api.value(7); // 0 = circle (+leaf label), 1 = parent label

      const fontSize = Math.max(8, Math.min(r / 3, 14));

      // Parent-label pass: a small dark pill pinned to the top rim. Emitted as a
      // separate, later data entry so it draws ON TOP of every circle — readable
      // over the fill or any child that packs against the top, never hidden
      // dead-centre under the (centred) children.
      if (kind === 1) {
        return {
          type: "text",
          style: {
            text: name,
            x: cx,
            y: cy - r + fontSize,
            fill: "#ffffff",
            backgroundColor: "rgba(0, 0, 0, 0.55)",
            padding: [2, 6] as [number, number],
            borderRadius: 4,
            fontSize,
            fontWeight: "bold",
            textAlign: "center",
            textVerticalAlign: "top",
            overflow: "truncate",
            width: r * 1.4,
          },
        };
      }

      // depth 1 → first citrine color, depth 2 → second, … (cycling).
      const fillColor =
        nodeColor || depthColors[(Math.max(1, depth) - 1) % depthColors.length];

      const group: { type: string; children: unknown[] } = {
        type: "group",
        children: [
          {
            type: "circle",
            shape: { cx, cy, r },
            style: {
              fill: depth === 0 ? ROOT_FILL : fillColor,
              stroke: depth === 0 ? "none" : "rgba(255, 255, 255, 0.6)",
              lineWidth: 1,
              opacity: depth === 0 ? 1 : 0.85,
            },
            emphasis: {
              style: {
                opacity: 1,
                shadowBlur: 8,
                shadowColor: "rgba(0, 0, 0, 0.25)",
              },
            },
          },
        ],
      };

      // Leaf labels sit centred inside their circle (nothing draws over them);
      // per-circle contrast text — black on light fills, white on dark.
      if (showLabels && r > 18 && depth > 0 && depth >= maxDepth) {
        (group.children as unknown[]).push({
          type: "text",
          style: {
            text: name,
            x: cx,
            y: cy,
            fill: contrastTextColor(String(fillColor)),
            fontSize,
            fontWeight: depth <= 1 ? "bold" : "normal",
            textAlign: "center",
            textVerticalAlign: "middle",
            overflow: "truncate",
            width: r * 1.4,
          },
        });
      }

      return group;
    };

    // Circle entries first; parent-label entries appended so they render last
    // (on top of all circles). value: [x, y, r, depth, value, color, name, kind]
    const circleData = nodes.map((n) => ({
      value: [n.x, n.y, n.r, n.depth, n.value, n.color ?? "", n.name, 0],
    }));
    const parentLabelData = showLabels
      ? nodes
          .filter((n) => n.depth > 0 && n.depth < maxDepth && n.r > 18)
          .map((n) => ({
            value: [n.x, n.y, n.r, n.depth, n.value, n.color ?? "", n.name, 1],
          }))
      : [];
    const seriesData = [...circleData, ...parentLabelData];

    return {
      tooltip: {
        trigger: "item",
        formatter: (params: unknown) => {
          const p = params as { value: (string | number)[] };
          const v = p.value;
          const name = String(v[6]);
          const value = Number(v[4]);
          if (!name) return "";
          return (
            "<strong>" +
            echarts.format.encodeHTML(name) +
            "</strong>" +
            (value > 0 ? ": " + echarts.format.encodeHTML(String(value)) : "")
          );
        },
      },
      series: [
        {
          type: "custom",
          coordinateSystem: "none",
          renderItem: renderItem as never,
          data: seriesData,
        },
      ],
      animationDuration: 800,
      animationEasingUpdate: "cubicOut",
    };
  }, [
    data,
    width,
    height,
    measured,
    showLabels,
    padding,
    stylingRules,
    paramValues,
    dark,
  ]);

  return (
    <div ref={containerRef} className="h-full w-full">
      <BaseChart
        options={options}
        ariaDescription={
          ariaDescription ??
          `Circle-packing chart with ${data.length} top-level groups`
        }
        {...rest}
      />
    </div>
  );
}

export { CirclePackingChart };
