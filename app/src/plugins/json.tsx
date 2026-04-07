/**
 * JSON viewer widget plugin.
 *
 * Collapsible JSON tree view for raw query results. No click action,
 * no styling — this is a read-only inspector widget.
 */

import { JsonViewer } from "@neoboard/components";
import { defineChartPlugin } from "./registry";
import { transformToJsonData } from "./transforms/json";
import { type PluginProps } from "./utils";
import { jsonSettingsSchema } from "./settings/json";

function JsonPluginComponent({ data, settings: raw }: PluginProps) {
  const settings = jsonSettingsSchema.parse(raw);
  return (
    <div className="h-full overflow-auto">
      <JsonViewer data={data} initialExpanded={settings.initialExpanded} />
    </div>
  );
}

export const jsonPlugin = defineChartPlugin({
  type: "json",
  label: "JSON Viewer",
  component: JsonPluginComponent,
  transform: transformToJsonData,
  transformWithMapping: transformToJsonData,
  compatibleWith: ["neo4j", "postgresql"],
  settingsSchema: jsonSettingsSchema,
  capabilities: {
    supportsClickAction: false,
    supportsStyling: false,
    isECharts: false,
    requiresQuery: true,
  },
  queryHint:
    "Returns any query result as a collapsible JSON tree. Any shape works.",
});
