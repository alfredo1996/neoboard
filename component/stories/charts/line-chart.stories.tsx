import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "storybook/test";
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

/**
 * What a play function can assert here: the line, its nulls/gaps, smoothing, the
 * area fill and the axis ticks are all painted to a <canvas> and are invisible to
 * the DOM. The assertable surface is the `role="img"` aria-label, which counts
 * points and names every series key — enough to catch a truncated dataset or a
 * dropped/renamed series, not enough to catch how a value was drawn. The visual
 * half (a null rendered as zero instead of a gap, #1655) needs a pixel baseline,
 * which this vitest build has no API for; that half lives in the option-object
 * unit test instead (`series.data` null entries / `connectNulls`).
 */
export const Default: Story = {
  args: {
    data: monthlyRevenue,
    xAxisLabel: "Month",
    yAxisLabel: "Revenue ($)",
  },
  play: async ({ canvasElement }) => {
    const chart = await within(canvasElement).findByTestId("base-chart");
    // 12 months in monthlyRevenue, single series keyed "y".
    await expect(chart).toHaveAttribute(
      "aria-label",
      "Line chart with 12 points and 1 series: y",
    );
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
  play: async ({ canvasElement }) => {
    const chart = await within(canvasElement).findByTestId("base-chart");
    await expect(chart).toHaveAttribute(
      "aria-label",
      "Line chart with 6 points and 3 series: revenue, cost, profit",
    );
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

/**
 * No play function: ECharts' `showLoading` paints its mask onto the canvas and
 * leaves no DOM trace, so "is it loading" cannot be observed at all from here.
 * Asserting anything else would just be asserting the chart exists.
 */
export const Loading: Story = {
  args: {
    data: monthlyRevenue,
    loading: true,
  },
};

/**
 * Unlike BarChart (which renders a DOM "No data" status, #1053), LineChart still
 * mounts a live but blank canvas when the data is empty — the only signal a
 * screen reader or a test gets is the aria-label. Asserted here as the current
 * contract; the missing DOM empty state is tracked separately.
 */
export const EmptyState: Story = {
  args: {
    data: [],
  },
  play: async ({ canvasElement }) => {
    const chart = await within(canvasElement).findByTestId("base-chart");
    await expect(chart).toHaveAttribute(
      "aria-label",
      "Line chart with no data",
    );
  },
};

/**
 * BaseChart's `error` branch: the canvas is replaced entirely by a DOM alert, so
 * this state is fully assertable.
 *
 * a11y is "todo" (not "error") on purpose: the alert uses the shared
 * `border-destructive/50 bg-destructive/10 text-destructive` token trio, which
 * measures 4.25:1 and fails color-contrast. Drop this override once that token
 * pair is fixed — it is a design-token defect, not a LineChart one.
 */
export const ErrorState: Story = {
  parameters: { a11y: { test: "todo" } },
  args: {
    data: monthlyRevenue,
    error: new Error("Query timed out after 30s"),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const alert = await canvas.findByRole("alert");
    await expect(alert).toHaveTextContent("Query timed out after 30s");
    // The error replaces the chart rather than sitting behind it.
    await expect(canvas.queryByTestId("base-chart")).toBeNull();
    await expect(canvasElement.querySelectorAll("canvas")).toHaveLength(0);
  },
};
