/**
 * Form widget plugin.
 *
 * Renders a user-editable form that executes a write query on submit.
 * No data transform — the form-widget-renderer handles its own state.
 */

import { FormWidgetRenderer } from "@/components/form-widget-renderer";
import { defineChartPlugin } from "./registry";

interface PluginComponentProps {
  settings: Record<string, unknown>;
  connectionId?: string;
  query?: string;
}

function FormPluginComponent({
  settings,
  connectionId,
  query,
}: PluginComponentProps) {
  return (
    <FormWidgetRenderer
      connectionId={connectionId ?? ""}
      query={query ?? ""}
      settings={settings}
    />
  );
}

export const formPlugin = defineChartPlugin({
  type: "form",
  label: "Form",
  component: FormPluginComponent,
  transform: () => [],
  compatibleWith: ["neo4j", "postgresql"],
  capabilities: {
    supportsClickAction: true,
    supportsStyling: false,
    isECharts: false,
    requiresQuery: false,
  },
  queryHint:
    "Write query executed on submit. Use $fieldName parameters to reference\n" +
    "form fields. Example: CREATE (u:User { name: $name, email: $email })",
});
