/**
 * Single-value chart plugin.
 *
 * Displays a single scalar value (number or string) with optional prefix,
 * suffix, title, and number formatting. Supports rule-based styling
 * (color / backgroundColor) but no click action.
 */

import dynamic from "next/dynamic";
import { Skeleton, getChartOptions } from "@neoboard/components";
import type { StylingRule } from "@neoboard/components";
import { normalizeValue } from "@/lib/shared/normalize-value";
import { defineChartPlugin } from "../registry";
import {
  transformToValueData,
  validateValueData,
  type SingleValueData,
} from "./transform";
import { type PluginProps } from "../utils";
import { singleValueSettingsSchema } from "./settings";
import { safeParseSettings } from "@/lib/plugin/safe-parse-settings";

const SingleValueChart = dynamic(
  () =>
    import("@neoboard/components").then((m) => ({
      default: m.SingleValueChart,
    })),
  { ssr: false, loading: () => <Skeleton className="w-full h-full" /> },
);

/**
 * Percentage change against the previous period, or undefined when the trend is
 * off or there is nothing to compare. A previous value of 0 yields a direction
 * without a percentage — dividing by it would render `Infinity%`.
 */
function buildTrend(
  enabled: boolean,
  value: string | number,
  previous: number | undefined,
): { direction: "up" | "down" | "neutral"; label?: string } | undefined {
  if (!enabled || typeof value !== "number" || previous === undefined) {
    return undefined;
  }
  const delta = value - previous;
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "neutral";
  if (previous === 0) {
    return {
      direction,
      label: direction === "neutral" ? "no change" : undefined,
    };
  }
  const pct = Math.abs(delta / previous) * 100;
  return {
    direction,
    label: direction === "neutral" ? "no change" : `${pct.toFixed(1)}%`,
  };
}

function SingleValuePluginComponent({
  data,
  settings: raw,
  stylingRules,
  paramValues,
}: PluginProps) {
  const settings = safeParseSettings(
    singleValueSettingsSchema,
    raw,
    "single-value",
  );
  // `transform` yields { value, previous }; older callers may still hand over a
  // bare scalar, so both shapes are accepted.
  const parsed: SingleValueData =
    data !== null && typeof data === "object" && "value" in data
      ? (data as SingleValueData)
      : { value: (normalizeValue(data) ?? 0) as string | number };

  const val = parsed.value;

  // The chart takes a computed { direction, label }, not a boolean — so the
  // option could never have been forwarded as-is. It needs the previous row,
  // which is why the transform now carries it (#1397).
  const trend = buildTrend(
    settings.trendEnabled === true,
    val,
    parsed.previous,
  );

  return (
    <SingleValueChart
      value={
        typeof val === "number" || typeof val === "string" ? val : String(val)
      }
      title={settings.title}
      prefix={settings.prefix}
      suffix={settings.suffix}
      fontSize={settings.fontSize}
      numberFormat={settings.numberFormat}
      decimalPlaces={settings.decimalPlaces}
      trend={trend}
      stylingRules={stylingRules as StylingRule[] | undefined}
      paramValues={paramValues}
    />
  );
}

export const singleValuePlugin = defineChartPlugin({
  type: "single-value",
  label: "Single Value",
  component: SingleValuePluginComponent,
  transform: transformToValueData,
  transformWithMapping: transformToValueData,
  validate: validateValueData,
  options: getChartOptions("single-value"),
  compatibleWith: ["neo4j", "postgresql"],
  settingsSchema: singleValueSettingsSchema,
  stylingTargets: [
    { value: "color", label: "Text Color" },
    { value: "backgroundColor", label: "Background Color" },
  ],
  capabilities: {
    supportsClickAction: false,
    supportsStyling: true,
    isECharts: true,
    requiresQuery: true,
  },
  queryHint:
    "Return 1 column with a scalar value (number or string).\n" +
    "Example: RETURN count(*) AS total",
});
