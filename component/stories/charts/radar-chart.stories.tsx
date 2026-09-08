import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "storybook/test";
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
  // Canvas-only chart: the accessible name is the only data-derived thing in
  // the DOM. It is two-dimensional (series x axes), so it catches a series or
  // an indicator lost on the way in — not the geometry, which needs pixels.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("img", {
      name: "Radar chart comparing 1 series across 5 axes",
    });
    await expect(canvasElement.querySelector("canvas")).toBeInTheDocument();
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
  },
};

export const MultiSeries: Story = {
  args: {
    data: multiSeriesData,
    showLegend: true,
  },
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole("img", {
      name: "Radar chart comparing 2 series across 5 axes",
    });
  },
};

/**
 * `null` = an axis nobody measured. It reaches ECharts as a null entry, the
 * label formatter has to print nothing rather than the string "null", and the
 * styling-rule mean has to skip it instead of averaging it as zero (#1655).
 * From the DOM only the "it still renders" half is visible — a null plotted as
 * zero looks identical to a null plotted as a gap, and both are canvas.
 */
export const MissingValues: Story = {
  args: {
    data: {
      indicators,
      series: [
        { name: "Model X", values: [85, null, 70, null, 80] },
        { name: "Model Y", values: [70, 75, 95, 85, 90] },
      ],
    },
    showLegend: true,
    showValues: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("img", {
      name: "Radar chart comparing 2 series across 5 axes",
    });
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
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
  // "No data" is painted into the canvas, not the DOM — the label is the only
  // signal a screen reader (or this test) gets that the chart is empty.
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole("img", {
      name: "Radar chart comparing 0 series across 0 axes",
    });
  },
};
