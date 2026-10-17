import type { Meta, StoryObj } from "@storybook/react";
import { Stat } from "@/components/kit/stat";

const meta = {
  title: "Kit/Stat",
  component: Stat,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  argTypes: { label: { control: "text" }, value: { control: "text" } },
  args: { label: "Dashboards", value: "8" },
} satisfies Meta<typeof Stat>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Row: Story = {
  render: () => (
    <div className="grid grid-cols-3 gap-3">
      <Stat label="Dashboards" value="8" />
      <Stat label="Widgets" value="356" />
      <Stat label="Connections" value="4" />
    </div>
  ),
};
export const RowDark: Story = {
  ...Row,
  globals: { theme: "dark" },
};
