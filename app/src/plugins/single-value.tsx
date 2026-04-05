/**
 * Single-value chart plugin.
 *
 * Displays a single scalar value (number or string) with optional prefix,
 * suffix, title, and number formatting. Supports rule-based styling
 * (color / backgroundColor) but no click action.
 */

import dynamic from "next/dynamic";
import { Skeleton } from "@neoboard/components";
import type { StylingRule } from "@neoboard/components";
import { normalizeValue } from "@/lib/normalize-value";
import { defineChartPlugin } from "./registry";
import { chartRegistry } from "@/lib/chart-registry";

const SingleValueChart = dynamic(
  () =>
    import("@neoboard/components").then((m) => ({
      default: m.SingleValueChart,
    })),
  { ssr: false, loading: () => <Skeleton className="w-full h-full" /> },
);

interface PluginComponentProps {
  data: unknown;
  settings: Record<string, unknown>;
  stylingRules?: StylingRule[];
  paramValues?: Record<string, unknown>;
  colorThresholds?: string;
}

function SingleValuePluginComponent({
  data,
  settings,
  stylingRules,
  paramValues,
  colorThresholds,
}: PluginComponentProps) {
  const raw = data ?? 0;
  const val =
    typeof raw === "number" || typeof raw === "string"
      ? raw
      : (normalizeValue(raw) ?? String(raw));
  return (
    <SingleValueChart
      value={
        typeof val === "number" || typeof val === "string" ? val : String(val)
      }
      title={settings.title as string | undefined}
      prefix={settings.prefix as string | undefined}
      suffix={settings.suffix as string | undefined}
      fontSize={settings.fontSize as "sm" | "md" | "lg" | "xl" | undefined}
      numberFormat={
        settings.numberFormat as
          | "plain"
          | "comma"
          | "compact"
          | "percent"
          | undefined
      }
      decimalPlaces={settings.decimalPlaces as number | undefined}
      colorThresholds={colorThresholds}
      stylingRules={stylingRules}
      paramValues={paramValues}
    />
  );
}

export const singleValuePlugin = defineChartPlugin({
  type: "single-value",
  label: "Single Value",
  component: SingleValuePluginComponent,
  transform: chartRegistry["single-value"].transform,
  transformWithMapping: chartRegistry["single-value"].transformWithMapping,
  validate: chartRegistry["single-value"].validate,
  compatibleWith: ["neo4j", "postgresql"],
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
