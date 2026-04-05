/**
 * JSON viewer widget plugin.
 *
 * Collapsible JSON tree view for raw query results. No click action,
 * no styling — this is a read-only inspector widget.
 */

import { JsonViewer } from "@neoboard/components";
import { defineChartPlugin } from "./registry";
import { chartRegistry } from "@/lib/chart-registry";

interface PluginComponentProps {
  data: unknown;
  settings: Record<string, unknown>;
}

function JsonPluginComponent({ data, settings }: PluginComponentProps) {
  return (
    <div className="h-full overflow-auto">
      <JsonViewer
        data={data}
        initialExpanded={(settings.initialExpanded as number) ?? 2}
      />
    </div>
  );
}

export const jsonPlugin = defineChartPlugin({
  type: "json",
  label: "JSON Viewer",
  component: JsonPluginComponent,
  transform: chartRegistry.json.transform,
  transformWithMapping: chartRegistry.json.transformWithMapping,
  compatibleWith: ["neo4j", "postgresql"],
  capabilities: {
    supportsClickAction: false,
    supportsStyling: false,
    isECharts: false,
    requiresQuery: true,
  },
  queryHint:
    "Returns any query result as a collapsible JSON tree. Any shape works.",
});
