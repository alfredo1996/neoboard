import type { Meta, StoryObj } from "@storybook/react";
import { PieChart } from "@/charts/pie-chart";

const meta = {
  title: "Charts/PieChart",
  component: PieChart,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ width: "100%", height: 400 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PieChart>;

export default meta;
type Story = StoryObj<typeof meta>;

const segmentData = [
  { name: "Desktop", value: 1048 },
  { name: "Mobile", value: 735 },
  { name: "Tablet", value: 580 },
  { name: "Smart TV", value: 234 },
  { name: "Other", value: 154 },
];

export const Default: Story = {
  args: {
    data: segmentData,
  },
};

export const Donut: Story = {
  args: {
    data: segmentData,
    donut: true,
  },
};

export const NoLabels: Story = {
  args: {
    data: segmentData,
    showLabel: false,
  },
};

export const NoLegend: Story = {
  args: {
    data: segmentData,
    showLegend: false,
  },
};

export const EmptyState: Story = {
  args: {
    data: [],
  },
};
