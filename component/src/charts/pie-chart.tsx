import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { BaseChart, useDarkMode } from "./base-chart";
import type { BaseChartProps, PieChartDataPoint } from "./types";
import { useContainerSize } from "@/hooks/useContainerSize";
import {
  buildEmptyDataOption,
  getCompactState,
  resolveItemColor,
  groupTopN,
  formatNumber,
  normalizeDecimalPlaces,
  escapeHtml,
} from "./chart-utils";
import type { StylingRule } from "./styling-rule";

/** The subset of ECharts' pie label/tooltip params this chart formats (#1248). */
interface PieLabelParams {
  name?: string;
  value?: unknown;
  percent?: unknown;
}

export interface PieChartProps extends Omit<BaseChartProps, "options"> {
  /** Array of `{ name, value }` slices */
  data: PieChartDataPoint[];
  /** Render as a donut chart */
  donut?: boolean;
  /** Show slice labels */
  showLabel?: boolean;
  /** Show legend */
  showLegend?: boolean;
  /** Use nightingale/rose mode (radii vary by value) */
  roseMode?: boolean;
  /** Label position */
  labelPosition?: "outside" | "inside" | "center";
  /** Show percentage in labels */
  showPercentage?: boolean;
  /** Fixed decimal places on slice values and in the tooltip; -1 or unset = automatic */
  decimalPlaces?: number;
  /** Sort slices by value descending */
  sortSlices?: boolean;
  /** Group slices beyond top N into "Other". 0 = show all. */
  topN?: number;
  /** Text shown in the center of a donut chart (e.g. total value). Empty = auto-total. */
  donutCenterText?: string;
  /** Rule-based styling rules */
  stylingRules?: StylingRule[];
  /** Resolved parameter values for parameterRef comparisons */
  paramValues?: Record<string, unknown>;
}

/**
 * Pie/donut chart for part-to-whole comparisons.
 * Accepts `data` as `Array<{ name, value }>`.
 *
 * Adapts to container size:
 * - Below 300px wide or 200px tall: hides labels (visible on hover)
 * - Below 200px tall: hides legend
 */
function PieChart({
  data,
  donut = false,
  showLabel = true,
  showLegend = true,
  roseMode = false,
  labelPosition = "outside",
  showPercentage = true,
  decimalPlaces,
  sortSlices = false,
  topN = 0,
  donutCenterText,
  stylingRules,
  paramValues,
  ariaDescription,
  ...rest
}: PieChartProps) {
  const { width, height, containerRef } = useContainerSize();
  const compact = width > 0 && (width < 300 || height < 200);
  const { hideLegend } = getCompactState(width, height);
  // Reactive theme value — memo must rebuild on toggle so the donut center
  // text / emphasis shadow don't freeze at their mount-time (often invisible)
  // dark color. (#chart-review)
  const dark = useDarkMode();

  // EChartsOption from modular imports may not include 'graphic' —
  // we use GraphicComponent which extends the option type at runtime.
  const options = useMemo((): EChartsOption & { graphic?: unknown } => {
    if (!data.length) return buildEmptyDataOption(dark);

    const effectiveShowLabel = compact ? false : showLabel;
    const effectiveShowLegend = hideLegend ? false : showLegend;

    const sorted = sortSlices
      ? [...data].sort((a, b) => b.value - a.value)
      : data;
    const sortedData = groupTopN(sorted, topN);

    const coloredData = sortedData.map((d) => {
      const color = resolveItemColor(d.value, stylingRules, paramValues);
      return color ? { ...d, itemStyle: { color } } : d;
    });

    // Numeric output goes through the shared formatter so the same value reads
    // identically in a chart label and a KPI card (#1248). ECharts' own {c}/{d}
    // templates give an unseparated value and 2dp percentages ("38.09%"), which
    // is more precision than the data justifies.
    //
    // `decimalPlaces` stays undefined unless the widget asks for a fixed count
    // (#1581), so integers stay clean ("2,751") instead of gaining the
    // helper's 2dp default ("2,751.00").
    const dp = normalizeDecimalPlaces(decimalPlaces);
    const fmtValue = (v: unknown) =>
      typeof v === "number"
        ? formatNumber(v, { numberFormat: "comma", decimalPlaces: dp })
        : "";
    const fmtPercent = (p: unknown) =>
      `${(typeof p === "number" ? p : 0).toFixed(1)}%`;

    const labelFormatter = (p: PieLabelParams) =>
      showPercentage
        ? `${p.name}: ${fmtPercent(p.percent)}`
        : `${p.name}: ${fmtValue(p.value)}`;

    return {
      tooltip: {
        trigger: "item",
        // Built by hand rather than via the "{b}: {c} ({d}%)" template so the
        // value and percentage match the labels (#1248). ECharts renders the
        // return value as HTML, and the name comes from query results, so it
        // must be escaped — the template form did not escape it either.
        // Typed as `unknown` and narrowed, matching buildTooltipFormatter:
        // ECharts' callback signature also admits an array (axis trigger),
        // which a narrower parameter type would reject at compile time.
        formatter: (params: unknown) => {
          const p = (
            Array.isArray(params) ? params[0] : params
          ) as PieLabelParams;
          return `${escapeHtml(String(p?.name ?? ""))}: ${fmtValue(p?.value)} (${fmtPercent(p?.percent)})`;
        },
      },
      legend: effectiveShowLegend
        ? {
            bottom: 0,
            type: "scroll",
            orient: "horizontal",
            width: "90%",
            pageIconSize: 12,
            pageTextStyle: { fontSize: 11 },
            pageButtonItemGap: 6,
            itemGap: 12,
            textStyle: { fontSize: 12 },
          }
        : undefined,
      series: [
        {
          type: "pie",
          roseType: roseMode ? ("radius" as const) : undefined,
          radius: donut ? ["40%", "70%"] : "70%",
          center: ["50%", effectiveShowLegend ? "45%" : "50%"],
          data: coloredData,
          label: {
            show: effectiveShowLabel,
            position: labelPosition,
            formatter: labelFormatter,
            fontSize: 12,
            overflow: "truncate",
            ellipsis: "…",
            // Hide labels for slices smaller than 3%
            minMargin: 5,
          },
          labelLine: {
            show: effectiveShowLabel && labelPosition === "outside",
            length: 15,
            length2: 10,
            smooth: true,
          },
          labelLayout: effectiveShowLabel ? { hideOverlap: true } : undefined,
          emphasis: {
            label: {
              show: true,
              fontSize: compact ? 12 : 14,
              fontWeight: "bold",
            },
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: dark
                ? "rgba(255, 255, 255, 0.15)"
                : "rgba(0, 0, 0, 0.5)",
            },
          },
        },
      ],
      // Donut center text: show total or custom text in the center hole
      ...(donut && !compact
        ? {
            graphic: [
              {
                type: "text",
                left: "center",
                top: effectiveShowLegend ? "42%" : "47%",
                style: {
                  text:
                    donutCenterText ??
                    // Auto-total gets separators; an explicit donutCenterText
                    // is user copy and is left exactly as given (#1248).
                    fmtValue(sortedData.reduce((s, d) => s + d.value, 0)),
                  align: "center",
                  fontSize: 20,
                  fontWeight: "bold",
                  // Theme foreground (matches the registered ECharts themes).
                  fill: dark ? "#f3f4f6" : "#14161a",
                },
              },
            ],
          }
        : {}),
    };
  }, [
    data,
    donut,
    showLabel,
    showLegend,
    roseMode,
    labelPosition,
    showPercentage,
    decimalPlaces,
    sortSlices,
    topN,
    donutCenterText,
    stylingRules,
    paramValues,
    compact,
    hideLegend,
    dark,
  ]);

  return (
    <div ref={containerRef} className="h-full w-full">
      <BaseChart
        options={options}
        ariaDescription={
          ariaDescription ?? `Pie chart with ${data.length} segments`
        }
        {...rest}
      />
    </div>
  );
}

export { PieChart };
