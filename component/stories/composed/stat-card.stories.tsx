import type { Meta, StoryObj } from '@storybook/react';
import { DollarSign, Users, Activity, CreditCard } from 'lucide-react';
import { StatCard } from '@/components/composed/stat-card';

const meta = {
  title: 'Composed/StatCard',
  component: StatCard,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    title: {
      control: 'text',
    },
    value: {
      control: 'text',
    },
    description: {
      control: 'text',
    },
  },
} satisfies Meta<typeof StatCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: 'Total Revenue',
    value: '$45,231.89',
    description: '+20.1% from last month',
  },
};

export const WithTrend: Story = {
  args: {
    title: 'Total Revenue',
    value: '$45,231.89',
    trend: { value: 20.1, label: 'from last month' },
    icon: <DollarSign className="h-4 w-4" />,
  },
};

export const NegativeTrend: Story = {
  args: {
    title: 'Bounce Rate',
    value: '24.5%',
    trend: { value: -5.2, label: 'from last week' },
    icon: <Activity className="h-4 w-4" />,
  },
};

export const Dashboard: Story = {
  args: { title: "Total Revenue", value: "$45,231.89" },
  render: () => (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Total Revenue"
        value="$45,231.89"
        trend={{ value: 20.1, label: 'from last month' }}
        icon={<DollarSign className="h-4 w-4" />}
      />
      <StatCard
        title="Subscriptions"
        value="+2350"
        trend={{ value: 180.1, label: 'from last month' }}
        icon={<Users className="h-4 w-4" />}
      />
      <StatCard
        title="Sales"
        value="+12,234"
        trend={{ value: 19, label: 'from last month' }}
        icon={<CreditCard className="h-4 w-4" />}
      />
      <StatCard
        title="Active Now"
        value="+573"
        trend={{ value: -2, label: 'since last hour' }}
        icon={<Activity className="h-4 w-4" />}
      />
    </div>
  ),
};
