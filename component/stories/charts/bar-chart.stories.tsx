import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "storybook/test";
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

/**
 * What a play function can assert here: BarChart draws its bars to a <canvas>,
 * so bar geometry, colours, value labels and axis ticks are unreachable from the
 * DOM. The one data-derived string that IS in the DOM is the `role="img"`
 * aria-label built by `buildAutoAriaDescription` — it counts rows and names every
 * series key, so it catches a dropped row, a dropped series or a mis-keyed
 * column. Everything else on this chart needs a pixel baseline (see #1638).
 */
export const Default: Story = {
  args: {
    data: productData,
  },
  play: async ({ canvasElement }) => {
    const chart = await within(canvasElement).findByTestId("base-chart");
    // 7 rows in productData, single series keyed "value".
    await expect(chart).toHaveAttribute(
      "aria-label",
      "Bar chart with 7 categories and 1 series: value",
    );
  },
};

export const Horizontal: Story = {
  args: {
    data: productData,
    orientation: "horizontal",
  },
};

/**
 * #1420: ten long category names, the Movie Highlights "Top actors" shape.
 * Horizontal bars stack categories vertically, so the labels stay level and
 * whole in the left gutter; before the fix they were rotated 45° and cut at
 * 15 characters. Wrapped at 530px, the demo card's width.
 */
export const HorizontalLongNames: Story = {
  args: {
    data: [
      "Tom Hanks",
      "Keanu Reeves",
      "Hugo Weaving",
      "Jack Nicholson",
      "Meg Ryan",
      "Tom Cruise",
      "Carrie-Anne Moss",
      "Laurence Fishburne",
      "Cuba Gooding Jr.",
      "Kevin Bacon",
    ].map((label, i) => ({ label, value: 12 - i })),
    orientation: "horizontal",
    showValues: true,
  },
  decorators: [
    (Story) => (
      <div style={{ width: 530, height: 400 }}>
        <Story />
      </div>
    ),
  ],
};

export const WithValues: Story = {
  args: {
    data: productData,
    showValues: true,
  },
};

const preciseData = [
  { label: "Widget A", value: 4200.567 },
  { label: "Widget B", value: 3100.123 },
  { label: "Widget C", value: 5400.891 },
  { label: "Widget D", value: 2800.345 },
];

/** The editor's "Decimal Places" option; -1 or unset leaves rounding automatic. */
export const FixedDecimalPlaces: Story = {
  args: {
    data: preciseData,
    showValues: true,
    decimalPlaces: 1,
  },
};

export const AutomaticDecimalPlaces: Story = {
  args: {
    data: preciseData,
    showValues: true,
    decimalPlaces: -1,
  },
};

export const GroupedBars: Story = {
  args: {
    data: stackedData,
    showLegend: true,
  },
  play: async ({ canvasElement }) => {
    const chart = await within(canvasElement).findByTestId("base-chart");
    // Multi-series: the label names each key in order, so a series dropped by
    // the union-of-keys walk (sparse rows) or renamed by a mapping bug shows up.
    await expect(chart).toHaveAttribute(
      "aria-label",
      "Bar chart with 4 categories and 3 series: online, retail, wholesale",
    );
  },
};

export const StackedBars: Story = {
  args: {
    data: stackedData,
    stackMode: "stacked",
    showLegend: true,
  },
};

export const HorizontalStacked: Story = {
  args: {
    data: stackedData,
    orientation: "horizontal",
    stackMode: "stacked",
    showLegend: true,
  },
};

/**
 * BarChart is the only ECharts chart in the package with a real DOM empty state
 * (#1053) — every other one still mounts a live, blank canvas. This play function
 * is the guard on that: DOM status message in, canvas out.
 */
export const EmptyState: Story = {
  args: {
    data: [],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const empty = await canvas.findByTestId("bar-chart-empty");
    await expect(empty).toHaveTextContent("No data");
    await expect(empty).toHaveAttribute("role", "status");
    // No ECharts instance at all — not a blank canvas the user can't read.
    await expect(canvasElement.querySelectorAll("canvas")).toHaveLength(0);
    await expect(canvas.queryByTestId("base-chart")).toBeNull();
  },
};

export const WithPalette: Story = {
  args: {
    data: stackedData,
    showLegend: true,
    colorPalette: "tableau",
  },
};
