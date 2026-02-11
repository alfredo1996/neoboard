import type { Meta, StoryObj } from "@storybook/react";
import { LineChart } from "@/charts/line-chart";

const meta = {
  title: "Charts/LineChart",
  component: LineChart,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ width: "100%", height: 400 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LineChart>;

export default meta;
type Story = StoryObj<typeof meta>;

const monthlyRevenue = [
  { x: "Jan", y: 4200 },
  { x: "Feb", y: 3800 },
  { x: "Mar", y: 5100 },
  { x: "Apr", y: 4600 },
  { x: "May", y: 5400 },
  { x: "Jun", y: 7200 },
  { x: "Jul", y: 6800 },
  { x: "Aug", y: 7400 },
  { x: "Sep", y: 6900 },
  { x: "Oct", y: 8100 },
  { x: "Nov", y: 7600 },
  { x: "Dec", y: 9200 },
];

const multiSeries = [
  { x: "Jan", revenue: 4200, cost: 3100, profit: 1100 },
  { x: "Feb", revenue: 3800, cost: 2900, profit: 900 },
  { x: "Mar", revenue: 5100, cost: 3400, profit: 1700 },
  { x: "Apr", revenue: 4600, cost: 3200, profit: 1400 },
  { x: "May", revenue: 5400, cost: 3600, profit: 1800 },
  { x: "Jun", revenue: 7200, cost: 4100, profit: 3100 },
];

export const Default: Story = {
  args: {
    data: monthlyRevenue,
    xAxisLabel: "Month",
    yAxisLabel: "Revenue ($)",
  },
};

export const Smooth: Story = {
  args: {
    data: monthlyRevenue,
    smooth: true,
  },
};

export const Area: Story = {
  args: {
    data: monthlyRevenue,
    smooth: true,
    area: true,
  },
};

export const MultipleSeries: Story = {
  args: {
    data: multiSeries,
    xAxisLabel: "Month",
    showLegend: true,
  },
};

export const MultipleSeriesArea: Story = {
  args: {
    data: multiSeries,
    smooth: true,
    area: true,
    showLegend: true,
  },
};

export const Loading: Story = {
  args: {
    data: monthlyRevenue,
    loading: true,
  },
};

export const EmptyState: Story = {
  args: {
    data: [],
  },
};
