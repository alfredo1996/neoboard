/**
 * Markdown widget plugin.
 *
 * Renders static markdown content — no query, no data transform.
 * This is the simplest possible plugin and serves as a reference
 * implementation during the plugin migration.
 */

import { MarkdownWidget, getChartOptions } from "@neoboard/components";
import { defineChartPlugin } from "./registry";
import { type PluginProps } from "./utils";
import { markdownSettingsSchema } from "./settings/markdown";

/**
 * Component adapter — extracts the `content` field from settings and
 * renders the MarkdownWidget. The plugin contract passes the full
 * settings object to the component as `settings` prop.
 */
function MarkdownPluginComponent({ settings: raw }: PluginProps) {
  const settings = markdownSettingsSchema.parse(raw);
  return <MarkdownWidget content={settings.content} />;
}

export const markdownPlugin = defineChartPlugin({
  type: "markdown",
  label: "Markdown",
  component: MarkdownPluginComponent,
  // Content-only widget — no data transform needed
  transform: () => null,
  settingsSchema: markdownSettingsSchema,
  capabilities: {
    supportsClickAction: false,
    supportsStyling: false,
    isECharts: false,
    requiresQuery: false,
  },
  queryHint:
    "Markdown widgets render static content — no query required. " +
    "Use the content field to write your text.",
  options: getChartOptions("markdown"),
});
