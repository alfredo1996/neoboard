import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { ChartOptionsPanel } from "@/components/composed/chart-options-panel";

/**
 * The editor's per-chart option list. Added with #1549 — the panel had no
 * story, so the help-text layout under each label could only be judged from
 * DOM assertions, which cannot see that a description was landing between a
 * label and its switch.
 */
const meta = {
  title: "Composed/ChartOptionsPanel",
  component: ChartOptionsPanel,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof ChartOptionsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

function Panel({ chartType }: { chartType: string }) {
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  return (
    // Roughly the width the panel gets in the widget editor's two-column grid.
    <div className="max-w-md">
      <ChartOptionsPanel
        chartType={chartType}
        settings={settings}
        onSettingsChange={(key, value) =>
          setSettings((prev) => ({ ...prev, [key]: value }))
        }
        columns={["region", "revenue", "units", "margin"]}
      />
    </div>
  );
}

/** Boolean-heavy: the rows where a description used to sit beside the switch. */
export const Bar: Story = {
  args: { chartType: "bar", settings: {}, onSettingsChange: () => {} },
  render: () => <Panel chartType="bar" />,
};

/** Carries the longest descriptions in the schema. */
export const Table: Story = {
  args: { chartType: "table", settings: {}, onSettingsChange: () => {} },
  render: () => <Panel chartType="table" />,
};
