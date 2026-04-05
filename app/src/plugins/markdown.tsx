/**
 * Markdown widget plugin.
 *
 * Renders static markdown content — no query, no data transform.
 * This is the simplest possible plugin and serves as a reference
 * implementation during the plugin migration.
 */

import { MarkdownWidget } from "@neoboard/components";
import { defineChartPlugin } from "./registry";

interface MarkdownWidgetProps {
  content?: string;
}

/**
 * Component adapter — extracts the `content` field from settings and
 * renders the MarkdownWidget. The plugin contract passes the full
 * settings object to the component as `settings` prop.
 */
function MarkdownPluginComponent({
  settings,
}: {
  settings: Record<string, unknown>;
}) {
  const props: MarkdownWidgetProps = {
    content: settings.content as string | undefined,
  };
  return <MarkdownWidget {...props} />;
}

export const markdownPlugin = defineChartPlugin({
  type: "markdown",
  label: "Markdown",
  component: MarkdownPluginComponent,
  // Content-only widget — no data transform needed
  transform: () => null,
  capabilities: {
    supportsClickAction: false,
    supportsStyling: false,
    isECharts: false,
    requiresQuery: false,
  },
  queryHint:
    "Markdown widgets render static content — no query required. " +
    "Use the content field to write your text.",
  options: [
    {
      key: "content",
      label: "Content",
      type: "text",
      default: "",
      category: "Content",
      description: "Markdown source for the widget body.",
    },
  ],
});
