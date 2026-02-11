import type { Meta, StoryObj } from "@storybook/react";
import { SingleValueChart } from "@/charts/single-value-chart";

const meta = {
  title: "Charts/SingleValueChart",
  component: SingleValueChart,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
} satisfies Meta<typeof SingleValueChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "Total Users",
    value: 12847,
    format: (v: number) => v.toLocaleString("en-US"),
  },
};

export const WithTrend: Story = {
  args: {
    title: "Revenue",
    value: 45231,
    prefix: "$",
    format: (v: number) => v.toLocaleString("en-US"),
    trend: { direction: "up", label: "+12.5% from last month" },
  },
};

export const DownwardTrend: Story = {
  args: {
    title: "Bounce Rate",
    value: 24.5,
    suffix: "%",
    trend: { direction: "down", label: "-3.2% from last week" },
  },
};

export const Loading: Story = {
  args: {
    title: "Loading Metric",
    value: 0,
    loading: true,
  },
};

export const ErrorState: Story = {
  args: {
    title: "Failed Metric",
    value: 0,
    error: new Error("Failed to fetch data"),
  },
};

export const Dashboard: Story = {
  args: { title: "Revenue", value: 45231, prefix: "$" },
  render: () => (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <SingleValueChart
        title="Revenue"
        value={45231}
        prefix="$"
        format={(v) => v.toLocaleString("en-US")}
        trend={{ direction: "up", label: "+12.5%" }}
      />
      <SingleValueChart
        title="Users"
        value={12847}
        format={(v) => v.toLocaleString("en-US")}
        trend={{ direction: "up", label: "+4.2%" }}
      />
      <SingleValueChart
        title="Bounce Rate"
        value={24.5}
        suffix="%"
        trend={{ direction: "down", label: "-3.2%" }}
      />
      <SingleValueChart
        title="Avg. Session"
        value="3m 42s"
        trend={{ direction: "neutral", label: "No change" }}
      />
    </div>
  ),
};
