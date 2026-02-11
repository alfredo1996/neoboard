import type { Meta, StoryObj } from "@storybook/react";
import { BarChart } from "@/charts/bar-chart";

const meta = {
  title: "Charts/BarChart",
  component: BarChart,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ width: "100%", height: 400 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BarChart>;

export default meta;
type Story = StoryObj<typeof meta>;

const productData = [
  { label: "Widget A", value: 4200 },
  { label: "Widget B", value: 3100 },
  { label: "Widget C", value: 5400 },
  { label: "Widget D", value: 2800 },
  { label: "Widget E", value: 6100 },
  { label: "Widget F", value: 3700 },
  { label: "Widget G", value: 4900 },
];

const stackedData = [
  { label: "Q1", online: 3200, retail: 1800, wholesale: 1200 },
  { label: "Q2", online: 4100, retail: 2200, wholesale: 1500 },
  { label: "Q3", online: 3800, retail: 2000, wholesale: 1800 },
  { label: "Q4", online: 5200, retail: 2800, wholesale: 2100 },
];

export const Default: Story = {
  args: {
    data: productData,
  },
};

export const Horizontal: Story = {
  args: {
    data: productData,
    orientation: "horizontal",
  },
};

export const WithValues: Story = {
  args: {
    data: productData,
    showValues: true,
  },
};

export const GroupedBars: Story = {
  args: {
    data: stackedData,
    showLegend: true,
  },
};

export const StackedBars: Story = {
  args: {
    data: stackedData,
    stacked: true,
    showLegend: true,
  },
};

export const HorizontalStacked: Story = {
  args: {
    data: stackedData,
    orientation: "horizontal",
    stacked: true,
    showLegend: true,
  },
};

export const EmptyState: Story = {
  args: {
    data: [],
  },
};
