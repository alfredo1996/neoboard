/**
 * Parameter selector widget plugin.
 *
 * Interactive input widget that exposes a dashboard parameter — dropdown,
 * text, date picker, number range, etc. Drives other widgets via the
 * parameter store. No data transform — the parameter-widget-renderer
 * handles its own option fetching.
 */

import { EmptyState } from "@neoboard/components";
import { ParameterWidgetRenderer } from "@/components/parameter-widget-renderer";
import type { ParameterType } from "@/stores/parameter-store";
import { defineChartPlugin } from "./registry";
import { chartRegistry } from "@/lib/chart-registry";

interface PluginComponentProps {
  settings: Record<string, unknown>;
  connectionId?: string;
  widgetId?: string;
}

function ParameterSelectPluginComponent({
  settings,
  connectionId,
  widgetId,
}: PluginComponentProps) {
  const pName = settings.parameterName as string | undefined;
  if (!pName) {
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
        parameterName={pName}
        parameterType={
          (settings.parameterType as ParameterType | undefined) ?? "select"
        }
        connectionId={connectionId}
        seedQuery={settings.seedQuery as string | undefined}
        parentParameterName={settings.parentParameterName as string | undefined}
        rangeMin={(settings.rangeMin as number | undefined) ?? 0}
        rangeMax={(settings.rangeMax as number | undefined) ?? 100}
        rangeStep={(settings.rangeStep as number | undefined) ?? 1}
        placeholder={(settings.placeholder as string | undefined) || undefined}
        searchable={(settings.searchable as boolean | undefined) ?? true}
        widgetId={widgetId}
      />
    </div>
  );
}

export const parameterSelectPlugin = defineChartPlugin({
  type: "parameter-select",
  label: "Parameter Selector",
  component: ParameterSelectPluginComponent,
  transform: chartRegistry["parameter-select"].transform,
  transformWithMapping: chartRegistry["parameter-select"].transformWithMapping,
  compatibleWith: ["neo4j", "postgresql"],
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
