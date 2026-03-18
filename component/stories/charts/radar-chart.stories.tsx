import type { Meta, StoryObj } from "@storybook/react";
import { RadarChart } from "@/charts/radar-chart";

const meta = {
  title: "Charts/RadarChart",
  component: RadarChart,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ width: "100%", height: 400 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RadarChart>;

export default meta;
type Story = StoryObj<typeof meta>;

const indicators = [
  { name: "Speed", max: 100 },
  { name: "Reliability", max: 100 },
  { name: "Comfort", max: 100 },
  { name: "Safety", max: 100 },
  { name: "Efficiency", max: 100 },
];

const defaultData = {
  indicators,
  series: [
    {
      name: "Model X",
      values: [85, 90, 70, 95, 80],
    },
  ],
};

const multiSeriesData = {
  indicators,
  series: [
    {
      name: "Model X",
      values: [85, 90, 70, 95, 80],
    },
    {
      name: "Model Y",
      values: [70, 75, 95, 85, 90],
    },
  ],
};

export const Default: Story = {
  args: {
    data: defaultData,
  },
};

export const MultiSeries: Story = {
  args: {
    data: multiSeriesData,
    showLegend: true,
  },
};

export const CircleShape: Story = {
  args: {
    data: defaultData,
    shape: "circle",
  },
};

export const WithValues: Story = {
  args: {
    data: defaultData,
    showValues: true,
  },
};

export const Unfilled: Story = {
  args: {
    data: multiSeriesData,
    filled: false,
    showLegend: true,
  },
};

export const EmptyState: Story = {
  args: {
    data: { indicators: [], series: [] },
  },
};
