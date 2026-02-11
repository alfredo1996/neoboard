import type { Meta, StoryObj } from '@storybook/react';
import { TimeAgo } from '@/components/composed/time-ago';

const meta = {
  title: 'Composed/TimeAgo',
  component: TimeAgo,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    showTooltip: { control: 'boolean' },
  },
} satisfies Meta<typeof TimeAgo>;

export default meta;
type Story = StoryObj<typeof meta>;

const now = new Date();

export const JustNow: Story = {
  args: {
    date: new Date(now.getTime() - 30 * 1000), // 30 seconds ago
  },
};

export const MinutesAgo: Story = {
  args: {
    date: new Date(now.getTime() - 5 * 60 * 1000), // 5 minutes ago
  },
};

export const HoursAgo: Story = {
  args: {
    date: new Date(now.getTime() - 3 * 60 * 60 * 1000), // 3 hours ago
  },
};

export const DaysAgo: Story = {
  args: {
    date: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
  },
};

export const AllFormats: Story = {
  args: { date: new Date() },
  render: () => {
    const dates = [
      { label: 'Just now', date: new Date(now.getTime() - 30 * 1000) },
      { label: '5 minutes', date: new Date(now.getTime() - 5 * 60 * 1000) },
      { label: '2 hours', date: new Date(now.getTime() - 2 * 60 * 60 * 1000) },
      { label: '3 days', date: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000) },
      { label: '2 weeks', date: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000) },
      { label: '2 months', date: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000) },
    ];

    return (
      <div className="space-y-2">
        {dates.map(({ label, date }) => (
          <div key={label} className="flex justify-between gap-8">
            <span className="text-sm text-muted-foreground">{label}:</span>
            <TimeAgo date={date} />
          </div>
        ))}
      </div>
    );
  },
};

export const ActivityFeed: Story = {
  args: { date: new Date() },
  render: () => (
    <div className="space-y-3 w-[300px]">
      {[
        { user: 'Alice', action: 'created a dashboard', time: new Date(now.getTime() - 5 * 60 * 1000) },
        { user: 'Bob', action: 'updated connection', time: new Date(now.getTime() - 2 * 60 * 60 * 1000) },
        { user: 'Carol', action: 'shared report', time: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      ].map((item, i) => (
        <div key={i} className="flex items-center justify-between text-sm">
          <span>
            <strong>{item.user}</strong> {item.action}
          </span>
          <TimeAgo date={item.time} className="text-muted-foreground" />
        </div>
      ))}
    </div>
  ),
};
