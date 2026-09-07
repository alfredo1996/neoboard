import { useMemo } from "react";
import * as echarts from "echarts/core";
import { CustomChart } from "echarts/charts";
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  DataZoomComponent,
  MarkLineComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";
import { BaseChart, useDarkMode } from "./base-chart";
import { TODAY_LINE_COLOR } from "./theme";
import { useContainerSize } from "@/hooks/useContainerSize";
import type { BaseChartProps } from "./types";
import { buildEmptyDataOption, getCompactState } from "./chart-utils";
import { resolveStylingRuleColor, type StylingRule } from "./styling-rule";

echarts.use([
  CustomChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  DataZoomComponent,
  MarkLineComponent,
  CanvasRenderer,
]);

export interface GanttDataItem {
  task: string;
  start: number;
  end: number;
  category?: string;
  progress?: number;
  [key: string]: unknown;
}

export interface GanttChartProps extends Omit<BaseChartProps, "options"> {
  /** Array of tasks: [{ task, start, end, category?, progress? }] */
  data: GanttDataItem[];
  /** Show a vertical "today" marker line */
  showTodayLine?: boolean;
  /** Show progress overlay inside bars */
  showProgress?: boolean;
  /** Bar corner radius */
  barBorderRadius?: number;
  /** Show grid lines */
  showGridLines?: boolean;
  /** Rule-based styling rules */
  stylingRules?: StylingRule[];
  /** Resolved parameter values for parameterRef comparisons */
  paramValues?: Record<string, unknown>;
}

/** Format ms duration to human-readable string. */
function formatDuration(ms: number): string {
  const hours = ms / 3600000;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)}d`;
  return `${Math.round(days / 30)}mo`;
}

function GanttChart({
  data,
  showTodayLine = true,
  showProgress = false,
  barBorderRadius = 2,
  showGridLines = true,
  stylingRules,
  paramValues,
  ariaDescription,
  ...rest
}: GanttChartProps) {
  // Measured, not guessed: the grid used to reserve "15%" for task names
  // while truncating them at a fixed 100px, so they only agreed at a 667px
  // canvas (#1289).
  const { width, height, containerRef } = useContainerSize();
  const { compact } = getCompactState(width, height);

  // The empty-state colour comes from the theme, so this memo has to
  // rebuild on a toggle — a DOM read inside it froze at mount (#1286).
  const dark = useDarkMode();

  const options = useMemo((): EChartsOption => {
    if (!data.length) return buildEmptyDataOption(dark);

    const taskNames = data.map((d) => d.task);
    const barHeightRatio = 0.6;

    // Resolve colors per item
    const resolvedColors = data.map((item) => {
      if (!stylingRules?.length) return undefined;
      // Evaluate each rule against the column it targets.
      // Rules with a `column` field match that specific data field;
      // rules without `column` try category first, then task name.
      for (const rule of stylingRules) {
        if (rule.column) {
          const cellValue = item[rule.column];
          if (cellValue != null) {
            const color = resolveStylingRuleColor(
              cellValue,
              [rule],
              paramValues,
            );
            if (color) return color;
          }
        } else {
          const catColor = item.category
            ? resolveStylingRuleColor(item.category, [rule], paramValues)
            : undefined;
          if (catColor) return catColor;
          const taskColor = resolveStylingRuleColor(
            item.task,
            [rule],
            paramValues,
          );
          if (taskColor) return taskColor;
        }
      }
      return undefined;
    });

    // Build series data: [taskIndex, start, end, duration, category, progress, resolvedColor]
    const seriesData = data.map((item, i) => ({
      value: [
        i,
        item.start,
        item.end,
        item.end - item.start,
        item.category ?? "",
        item.progress ?? 0,
      ],
      itemStyle: resolvedColors[i] ? { color: resolvedColors[i] } : undefined,
    }));

    // Custom renderItem for horizontal bars
    const renderItem = (
      _params: {
        coordSys: { x: number; y: number; width: number; height: number };
      },
      api: {
        value: (dim: number) => number;
        coord: (val: [number, number]) => [number, number];
        size: (val: [number, number]) => [number, number];
        style: (extra?: Record<string, unknown>) => Record<string, unknown>;
        visual: (key: string) => string;
      },
    ) => {
      const taskIndex = api.value(0);
      const startTime = api.value(1);
      const endTime = api.value(2);
      const progress = api.value(5);

      const startCoord = api.coord([startTime, taskIndex]);
      const endCoord = api.coord([endTime, taskIndex]);
      const barHeight = api.size([0, 1])[1] * barHeightRatio;

      const x = startCoord[0];
      const y = startCoord[1] - barHeight / 2;
      const width = Math.max(endCoord[0] - startCoord[0], 2); // min 2px width

      const group: { type: string; children: unknown[] } = {
        type: "group",
        children: [
          // Main bar
          {
            type: "rect",
            shape: {
              x,
              y,
              width,
              height: barHeight,
              r: barBorderRadius,
            },
            style: api.style(),
            emphasis: {
              style: {
                shadowBlur: 6,
                shadowColor: "rgba(0, 0, 0, 0.3)",
              },
            },
          },
        ],
      };

      // Progress overlay
      if (showProgress && progress > 0) {
        const progressWidth = width * Math.min(progress, 1);
        const full = progress >= 1;
        (group.children as unknown[]).push({
          type: "rect",
          shape: {
            x,
            y,
            width: progressWidth,
            height: barHeight,
            // Only round the right side when the overlay spans the whole bar
            r: full
              ? barBorderRadius
              : [barBorderRadius, 0, 0, barBorderRadius],
          },
          style: {
            fill: "rgba(255, 255, 255, 0.25)",
          },
        });
      }

      return group;
    };

    const todayMarkLine = showTodayLine
      ? {
          markLine: {
            silent: true,
            symbol: "none",
            lineStyle: {
              // Muted, not red: today is a reference, and the destructive
              // colour made every gantt read as though something were wrong
              // (#1273). Hex because canvas cannot read CSS vars.
              color: TODAY_LINE_COLOR[dark ? "dark" : "light"],
              type: "dashed" as const,
              width: 1.5,
            },
            label: {
              formatter: "Today",
              position: "insideStartTop" as const,
              fontSize: 10,
              // The label inherited the line colour, so it went red too.
              color: TODAY_LINE_COLOR[dark ? "dark" : "light"],
            },
            data: [{ xAxis: Date.now() }],
          },
        }
      : {};

    return {
      tooltip: {
        trigger: "item",
        formatter: (params: unknown) => {
          const p = params as { value: number[] };
          const v = p.value;
          const name = taskNames[v[0]];
          const start = new Date(v[1]).toLocaleDateString();
          const end = new Date(v[2]).toLocaleDateString();
          const duration = formatDuration(v[3]);
          const category = v[4]
            ? `<br/>Category: ${echarts.format.encodeHTML(String(v[4]))}`
            : "";
          const progress =
            v[5] > 0 ? `<br/>Progress: ${Math.round(Number(v[5]) * 100)}%` : "";
          return `<strong>${echarts.format.encodeHTML(name)}</strong><br/>${start} → ${end} (${duration})${category}${progress}`;
        },
      },
      // Pixels, and let ECharts reserve the label gutter itself. "15%" only
      // matched the 100px truncation budget at a 667px canvas — narrower than
      // that and task names were hard-clipped (#1289).
      grid: {
        left: compact ? 8 : 16,
        right: compact ? 8 : 16,
        top: compact ? 8 : 16,
        // Room for the zoom slider: height 20 + bottom 5 + gap.
        bottom: 40,
        containLabel: true,
      },
      xAxis: {
        type: "time",
        // Without a formatter a sub-month range labels as bare day numbers,
        // which reads as a count rather than a date (#1289).
        axisLabel: {
          formatter: {
            year: "{yyyy}",
            // Just the month name: ECharts uses this template for the tick at
            // a month boundary, so "{MMM} {yyyy}" printed "May 2026" wedged
            // between "Apr 29" and "May 3". The year still appears on the
            // year-level tick.
            month: "{MMM}",
            day: "{MMM} {d}",
            hour: "{HH}:{mm}",
            minute: "{HH}:{mm}",
          },
        },
        // No local lineStyle: the registered theme owns gridline weight and
        // colour so every cartesian chart draws the same grid (#1247).
        splitLine: { show: showGridLines },
      },
      yAxis: {
        type: "category",
        data: taskNames,
        inverse: true,
        axisLabel: {
          fontSize: 11,
          overflow: "truncate",
          ellipsis: "…",
          width: compact ? 60 : 100,
        },
        splitLine: { show: false },
      },
      // No colours here: the slider's palette lives in the registered theme,
      // so every chart's zoom control looks the same (#1273).
      dataZoom: [
        // Horizontal: time axis zoom
        {
          type: "slider",
          xAxisIndex: 0,
          height: 20,
          bottom: 5,
        },
        {
          type: "inside",
          xAxisIndex: 0,
        },
        // Vertical: task list scroll (show ~15 tasks at a time)
        ...(taskNames.length > 15
          ? [
              {
                type: "slider" as const,
                yAxisIndex: 0,
                width: 12,
                right: 0,
                startValue: 0,
                endValue: 14,
                handleSize: "60%",
              },
              {
                type: "inside" as const,
                yAxisIndex: 0,
              },
            ]
          : []),
      ],
      series: [
        {
          type: "custom",
          renderItem: renderItem as never,
          encode: {
            x: [1, 2],
            y: 0,
          },
          data: seriesData,
          ...todayMarkLine,
        },
      ],
      animationDuration: 500,
      animationEasingUpdate: "cubicOut",
    };
  }, [
    data,
    showTodayLine,
    showProgress,
    barBorderRadius,
    showGridLines,
    stylingRules,
    paramValues,
    dark,
    // Read above for the grid and the label width. Omitting it latches the
    // first measurement — the #1546/#1562 class.
    compact,
  ]);

  return (
    <div ref={containerRef} className="h-full w-full">
      <BaseChart
        options={options}
        ariaDescription={
          ariaDescription ?? `Gantt chart with ${data.length} tasks`
        }
        {...rest}
      />
    </div>
  );
}

export { GanttChart };
