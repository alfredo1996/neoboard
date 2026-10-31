import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { chartOptionGroups } from "@/components/composed/chart-options-panel";
import { ChartSettingsPanel } from "@/components/composed/chart-settings-panel";
import type { SettingsGroup } from "@/components/composed/chart-settings-panel";
import { SettingRow } from "@/components/composed/setting-row";
import { Input } from "@/components/ui/input";
import type { OptionSection } from "@/components/composed/chart-options-schema";

const meta = {
  title: "Composed/ChartSettingsPanel",
  component: ChartSettingsPanel,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof ChartSettingsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The widget editor's side nav and pane (#2388). The sections never move, the
 * active section's groups are jump links beneath them, and the pane is the one
 * scroller. The real editor puts the preview in the third grid cell.
 */
function Editor({ chartType }: Readonly<{ chartType: string }>) {
  const [section, setSection] = useState<OptionSection>("style");
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const groups: SettingsGroup[] =
    chartType === "markdown"
      ? []
      : [
          {
            name: "Query",
            render: () => (
              <SettingRow label="Connection" htmlFor="story-connection">
                <Input id="story-connection" defaultValue="Movies" />
              </SettingRow>
            ),
          },
          {
            name: "Transform",
            render: () => (
              <SettingRow label="Add a step" htmlFor="story-step">
                <Input id="story-step" defaultValue="Filter" />
              </SettingRow>
            ),
          },
        ];
  groups.push(
    ...chartOptionGroups({
      chartType,
      settings,
      onSettingsChange: setSettings,
      columns: ["region", "revenue"],
    }),
  );
  return (
    <div className="grid h-[520px] max-w-3xl grid-cols-[168px_minmax(0,1fr)] overflow-hidden rounded-md border border-rule">
      <ChartSettingsPanel
        groups={groups}
        section={section}
        onSectionChange={setSection}
        searchable
      />
    </div>
  );
}

export const Bar: Story = {
  args: { groups: [], section: "style", onSectionChange: () => {} },
  render: () => <Editor chartType="bar" />,
  // The sections are one vertical tablist: arrows move focus, Enter selects.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const style = canvas.getByRole("tab", { name: "Style" });
    style.focus();
    await userEvent.keyboard("{ArrowDown}");
    await expect(canvas.getByRole("tab", { name: "Behavior" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect(canvas.getByRole("tab", { name: "Behavior" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  },
};

/** Markdown has Content and nothing else here: Data, Style and Behavior hide. */
export const Markdown: Story = {
  args: { groups: [], section: "content", onSectionChange: () => {} },
  render: () => <Editor chartType="markdown" />,
};
