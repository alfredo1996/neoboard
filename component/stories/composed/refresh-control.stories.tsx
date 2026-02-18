import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { RefreshControl } from '@/components/composed/refresh-control';

const meta = {
  title: 'Composed/RefreshControl',
  component: RefreshControl,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta<typeof RefreshControl>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};

export const Enabled: Story = {
  args: {
    enabled: true,
    interval: '30',
  },
};

export const WithRefreshButton: Story = {
  args: {
    onRefreshNow: () => console.log('Refresh'),
  },
};

export const Refreshing: Story = {
  args: {
    onRefreshNow: () => {},
    refreshing: true,
  },
};

export const Controlled: Story = {
  args: {},
  render: () => {
    const [enabled, setEnabled] = useState(false);
    const [interval, setInterval] = useState('30');
    const [refreshing, setRefreshing] = useState(false);

    const handleRefresh = () => {
      setRefreshing(true);
      setTimeout(() => setRefreshing(false), 1500);
    };

    return (
      <RefreshControl
        enabled={enabled}
        onToggle={setEnabled}
        interval={interval}
        onIntervalChange={setInterval}
        onRefreshNow={handleRefresh}
        refreshing={refreshing}
      />
    );
  },
};
