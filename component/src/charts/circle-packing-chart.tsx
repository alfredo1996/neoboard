import { useMemo } from "react";
import * as echarts from "echarts/core";
import { CustomChart } from "echarts/charts";
import { TitleComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";
import { pack, hierarchy, type HierarchyCircularNode } from "d3-hierarchy";
import { BaseChart } from "./base-chart";
import type { BaseChartProps } from "./types";
import { useContainerSize } from "@/hooks/useContainerSize";
import {
  buildEmptyDataOption,
  resolveItemColor,
  FILL_LABEL_COLOR,
  FILL_LABEL_OUTLINE,
  FILL_LABEL_OUTLINE_WIDTH,
} from "./chart-utils";
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

/** Default color palette by depth level. */
const DEPTH_COLORS = [
  "rgba(100, 140, 200, 0.15)", // root background
  "#5470c6",
  "#91cc75",
  "#fac858",
  "#ee6666",
  "#73c0de",
  "#3ba272",
  "#fc8452",
  "#9a60b4",
];

function CirclePackingChart({
  data,
  showLabels = true,
  padding = 3,
  stylingRules,
  paramValues,
  ...rest
}: CirclePackingChartProps) {
  const { width, height, containerRef } = useContainerSize();
  const measured = width > 0;

  const options = useMemo((): EChartsOption | undefined => {
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

      const fillColor =
        nodeColor ||
        DEPTH_COLORS[depth] ||
        DEPTH_COLORS[DEPTH_COLORS.length - 1];

      const group: { type: string; children: unknown[] } = {
        type: "group",
        children: [
          {
            type: "circle",
            shape: { cx, cy, r },
            style: {
              fill: depth === 0 ? "rgba(100, 140, 200, 0.08)" : fillColor,
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

      // Add label for leaf nodes or nodes with enough radius
      if (showLabels && r > 18 && depth > 0) {
        const fontSize = Math.max(8, Math.min(r / 3, 14));
        (group.children as unknown[]).push({
          type: "text",
          style: {
            text: name,
            x: cx,
            y: cy,
            // White + subtle dark outline reads on light- and dark-tinted
            // circles alike (custom zrender text uses stroke/lineWidth).
            fill: FILL_LABEL_COLOR,
            stroke: FILL_LABEL_OUTLINE,
            lineWidth: FILL_LABEL_OUTLINE_WIDTH,
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

    // Build series data: [x, y, r, depth, value, color, name]
    const seriesData = nodes.map((n) => ({
      value: [n.x, n.y, n.r, n.depth, n.value, n.color ?? "", n.name],
    }));

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
  ]);

  return (
    <div ref={containerRef} className="h-full w-full">
      <BaseChart options={options} {...rest} />
    </div>
  );
}

export { CirclePackingChart };
