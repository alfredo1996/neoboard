import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { ColorScalePanel } from "@/components/composed/conditional-format-panel";
import type { ColorScaleConfig } from "@/charts/styling-rule";

const meta = {
  title: "Composed/ColorScalePanel",
  component: ColorScalePanel,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[440px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ColorScalePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const COLUMNS = ["revenue", "orders", "rating", "quantity"];

function ControlledDemo({ initial }: { initial: ColorScaleConfig[] }) {
  const [scales, setScales] = useState<ColorScaleConfig[]>(initial);
  return (
    <ColorScalePanel
      columns={COLUMNS}
      colorScales={scales}
      onColorScalesChange={setScales}
    />
  );
}

export const Empty: Story = {
  args: { columns: COLUMNS, colorScales: [], onColorScalesChange: () => {} },
  render: () => <ControlledDemo initial={[]} />,
};

export const WithScales: Story = {
  args: Empty.args,
  render: () => (
    <ControlledDemo
      initial={[
        { column: "revenue", minColor: "#fff7d6", maxColor: "#993404" },
        { column: "rating", minColor: "#eff6ff", maxColor: "#1d4ed8" },
      ]}
    />
  ),
};
