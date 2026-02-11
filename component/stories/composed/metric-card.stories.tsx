import type { Meta, StoryObj } from "@storybook/react";
import { DollarSign, Users, Activity, TrendingUp } from "lucide-react";
import { MetricCard } from "@/components/composed/metric-card";

const meta = {
  title: "Composed/MetricCard",
  component: MetricCard,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
} satisfies Meta<typeof MetricCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "Total Revenue",
    value: "$45,231",
  },
};

export const WithTrend: Story = {
  args: {
    title: "Total Revenue",
    value: 45231,
    previousValue: 38100,
    prefix: "$",
    icon: <DollarSign className="h-4 w-4" />,
  },
};

export const WithSparkline: Story = {
  args: {
    title: "Active Users",
    value: 2350,
    previousValue: 2100,
    sparklineData: [1800, 1900, 2000, 1950, 2100, 2200, 2350],
    icon: <Users className="h-4 w-4" />,
  },
};

export const NegativeTrend: Story = {
  args: {
    title: "Bounce Rate",
    value: 24.5,
    previousValue: 28.1,
    suffix: "%",
    trend: "down",
    sparklineData: [30, 29, 28, 27, 26, 25, 24.5],
    icon: <Activity className="h-4 w-4" />,
  },
};

export const FormattedValue: Story = {
  args: {
    title: "Revenue",
    value: 1234567,
    previousValue: 1100000,
    format: (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v),
    icon: <TrendingUp className="h-4 w-4" />,
    sparklineData: [900000, 1000000, 1050000, 1100000, 1150000, 1200000, 1234567],
  },
};

export const Dashboard: Story = {
  args: {
    title: "Revenue",
    value: 45231,
    previousValue: 38100,
    prefix: "$",
    sparklineData: [30000, 32000, 35000, 38000, 38100, 42000, 45231],
    icon: <DollarSign className="h-4 w-4" />,
  },
  render: () => (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        title="Revenue"
        value={45231}
        previousValue={38100}
        prefix="$"
        sparklineData={[30000, 32000, 35000, 38000, 38100, 42000, 45231]}
        icon={<DollarSign className="h-4 w-4" />}
      />
      <MetricCard
        title="Users"
        value={2350}
        previousValue={2100}
        sparklineData={[1800, 1900, 2000, 1950, 2100, 2200, 2350]}
        icon={<Users className="h-4 w-4" />}
      />
      <MetricCard
        title="Bounce Rate"
        value={24.5}
        previousValue={28.1}
        suffix="%"
        trend="down"
        sparklineData={[30, 29, 28, 27, 26, 25, 24.5]}
        icon={<Activity className="h-4 w-4" />}
      />
      <MetricCard
        title="Conversions"
        value={573}
        previousValue={573}
        sparklineData={[560, 565, 570, 573, 573, 573, 573]}
        icon={<TrendingUp className="h-4 w-4" />}
      />
    </div>
  ),
};
