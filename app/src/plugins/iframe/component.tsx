/**
 * Iframe widget plugin.
 *
 * Embeds an external URL in the dashboard. No query, no data transform.
 */

import { IframeWidget, getChartOptions } from "@neoboard/components";
import { defineChartPlugin } from "../registry";
import { type PluginProps } from "../utils";
import { iframeSettingsSchema } from "./settings";
import { safeParseSettings } from "@/lib/plugin/safe-parse-settings";

function IframePluginComponent({ settings: raw }: PluginProps) {
  const settings = safeParseSettings(iframeSettingsSchema, raw, "iframe");
  return (
    <IframeWidget
      url={settings.url}
      title={settings.iframeTitle}
      sandbox={settings.sandbox}
    />
  );
}

export const iframePlugin = defineChartPlugin({
  type: "iframe",
  label: "iFrame",
  component: IframePluginComponent,
  transform: () => null,
  options: getChartOptions("iframe"),
  compatibleWith: ["neo4j", "postgresql"],
  settingsSchema: iframeSettingsSchema,
  capabilities: {
    supportsClickAction: false,
    supportsStyling: false,
    isECharts: false,
    requiresQuery: false,
  },
  queryHint:
    "Iframe widgets embed an external URL — no query required. " +
    "Use the URL field in the widget settings.",
});
