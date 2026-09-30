/**
 * Form widget plugin.
 *
 * Renders a user-editable form that executes a write query on submit.
 * No data transform — the form-widget-renderer handles its own state.
 */

import { getChartOptions } from "@neoboard/components";
import { FormWidgetRenderer } from "@/components/form-widget-renderer";
import { defineChartPlugin } from "../registry";
import { type PluginProps } from "../utils";
import { formSettingsSchema } from "./settings";
import { safeParseSettings } from "@/lib/plugin/safe-parse-settings";

function FormPluginComponent({
  settings: raw,
  connectionId,
  database,
  widgetId,
  query,
}: Readonly<PluginProps>) {
  const settings = safeParseSettings(formSettingsSchema, raw, "form");
  return (
    <FormWidgetRenderer
      connectionId={connectionId ?? ""}
      database={database}
      widgetId={widgetId}
      query={query ?? ""}
      settings={settings}
    />
  );
}

export const formPlugin = defineChartPlugin({
  type: "form",
  label: "Form",
  component: FormPluginComponent,
  // A form submits a write, so its connector must support one (#2068).
  requires: ["writes"],
  transform: () => [],
  options: getChartOptions("form"),
  settingsSchema: formSettingsSchema,
  capabilities: {
    supportsClickAction: true,
    supportsStyling: false,
    isECharts: false,
    requiresQuery: false,
  },
});
