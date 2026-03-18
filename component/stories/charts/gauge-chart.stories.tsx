import type { Meta, StoryObj } from "@storybook/react";
import { GaugeChart } from "@/charts/gauge-chart";

const meta = {
  title: "Charts/GaugeChart",
  component: GaugeChart,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ width: "100%", height: 400 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GaugeChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    data: [{ value: 75 }],
  },
};

export const WithLabel: Story = {
  args: {
    data: [{ value: 62, name: "Performance" }],
  },
};

export const HighValue: Story = {
  args: {
    data: [{ value: 95, name: "CPU Load" }],
  },
};

export const LowValue: Story = {
  args: {
    data: [{ value: 10, name: "Memory Usage" }],
  },
};

export const CustomRange: Story = {
  args: {
    data: [{ value: 3500, name: "RPM" }],
    min: 0,
    max: 8000,
  },
};

export const NoPointer: Story = {
  args: {
    data: [{ value: 55, name: "Progress" }],
    showPointer: false,
  },
};

export const EmptyState: Story = {
  args: {
    data: [],
  },
};
