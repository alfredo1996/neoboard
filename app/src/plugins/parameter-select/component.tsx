/**
 * Parameter selector widget plugin.
 *
 * Interactive input widget that exposes a dashboard parameter — dropdown,
 * text, date picker, number range, etc. Drives other widgets via the
 * parameter store. No data transform — the parameter-widget-renderer
 * handles its own option fetching.
 */

import { EmptyState, getChartOptions } from "@neoboard/components";
import { ParameterWidgetRenderer } from "@/components/parameter-widget-renderer";
import type { ParameterType } from "@/stores/parameter-store";
import { defineChartPlugin } from "../registry";
import { transformToSelectData } from "./transform";
import { type PluginProps } from "../utils";
import { parameterSelectSettingsSchema } from "./settings";

function ParameterSelectPluginComponent({
  settings: raw,
  connectionId,
  widgetId,
}: PluginProps) {
  const settings = parameterSelectSettingsSchema.parse(raw);
  if (!settings.parameterName) {
    return (
      <EmptyState
        title="No parameter name"
        description="Configure a parameter name in the widget settings."
        className="py-6"
      />
    );
  }
  return (
    <div className="p-4">
      <ParameterWidgetRenderer
        parameterName={settings.parameterName}
        parameterType={settings.parameterType as ParameterType}
        connectionId={connectionId}
        seedQuery={settings.seedQuery}
        parentParameterName={settings.parentParameterName}
        rangeMin={settings.rangeMin}
        rangeMax={settings.rangeMax}
        rangeStep={settings.rangeStep}
        placeholder={settings.placeholder || undefined}
        searchable={settings.searchable}
        widgetId={widgetId}
      />
    </div>
  );
}

export const parameterSelectPlugin = defineChartPlugin({
  type: "parameter-select",
  label: "Parameter Selector",
  component: ParameterSelectPluginComponent,
  transform: transformToSelectData,
  transformWithMapping: transformToSelectData,
  options: getChartOptions("parameter-select"),
  compatibleWith: ["neo4j", "postgresql"],
  settingsSchema: parameterSelectSettingsSchema,
  capabilities: {
    supportsClickAction: false,
    supportsStyling: false,
    isECharts: false,
    requiresQuery: false,
  },
  queryHint:
    "Optional seed query — return a single column of values to populate the\n" +
    "selector options. Example: RETURN DISTINCT category FROM items",
});
