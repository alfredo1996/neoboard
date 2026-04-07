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
import { normalizeValue } from "@/lib/normalize-value";
import { defineChartPlugin } from "./registry";
import {
  transformToValueData,
  validateValueData,
} from "./transforms/single-value";
import { type PluginProps } from "./utils";
import { singleValueSettingsSchema } from "./settings/single-value";

const SingleValueChart = dynamic(
  () =>
    import("@neoboard/components").then((m) => ({
      default: m.SingleValueChart,
    })),
  { ssr: false, loading: () => <Skeleton className="w-full h-full" /> },
);

function SingleValuePluginComponent({
  data,
  settings: raw,
  stylingRules,
  paramValues,
  colorThresholds,
}: PluginProps) {
  const parsed = singleValueSettingsSchema.safeParse(raw);
  const settings = parsed.success
    ? parsed.data
    : singleValueSettingsSchema.parse({});
  const rawData = data ?? 0;
  const val =
    typeof rawData === "number" || typeof rawData === "string"
      ? rawData
      : (normalizeValue(rawData) ?? String(rawData));
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
      colorThresholds={colorThresholds}
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
