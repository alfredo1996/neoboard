/**
 * Iframe widget plugin.
 *
 * Embeds an external URL in the dashboard. No query, no data transform.
 */

import { IframeWidget } from "@neoboard/components";
import { defineChartPlugin } from "./registry";
import { type PluginProps } from "./utils";

function IframePluginComponent({ settings }: PluginProps) {
  return (
    <IframeWidget
      url={settings.url as string | undefined}
      title={settings.iframeTitle as string | undefined}
      sandbox={settings.sandbox as string | undefined}
    />
  );
}

export const iframePlugin = defineChartPlugin({
  type: "iframe",
  label: "iFrame",
  component: IframePluginComponent,
  transform: () => null,
  compatibleWith: ["neo4j", "postgresql"],
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
