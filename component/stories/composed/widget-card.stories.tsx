import type { Meta, StoryObj } from '@storybook/react';
import { WidgetCard } from '@/components/composed/widget-card';

const meta = {
  title: 'Composed/WidgetCard',
  component: WidgetCard,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    title: { control: 'text' },
    subtitle: { control: 'text' },
    draggable: { control: 'boolean' },
  },
} satisfies Meta<typeof WidgetCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: 'Revenue Chart',
    subtitle: 'Monthly revenue breakdown',
    children: (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        Chart content goes here
      </div>
    ),
  },
};

export const WithActions: Story = {
  args: {
    title: 'Active Users',
    subtitle: 'Real-time user activity',
    actions: [
      { label: 'Edit', onClick: () => {} },
      { label: 'Duplicate', onClick: () => {} },
      { label: 'Delete', onClick: () => {}, destructive: true },
    ],
    children: (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        Widget content
      </div>
    ),
  },
};

export const Draggable: Story = {
  args: {
    title: 'Draggable Widget',
    draggable: true,
    actions: [
      { label: 'Configure', onClick: () => {} },
      { label: 'Remove', onClick: () => {}, destructive: true },
    ],
    children: (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        Drag the handle to reorder
      </div>
    ),
  },
};

export const DashboardLayout: Story = {
  args: { title: "Dashboard", children: null },
  render: () => (
    <div className="grid gap-4 md:grid-cols-2 w-[700px]">
      <WidgetCard
        title="Revenue"
        subtitle="Last 30 days"
        actions={[{ label: 'Edit', onClick: () => {} }]}
      >
        <div className="flex items-center justify-center h-32 text-muted-foreground">
          $45,231
        </div>
      </WidgetCard>
      <WidgetCard
        title="Users"
        subtitle="Active this week"
        actions={[{ label: 'Edit', onClick: () => {} }]}
      >
        <div className="flex items-center justify-center h-32 text-muted-foreground">
          2,350
        </div>
      </WidgetCard>
      <WidgetCard title="Recent Orders" className="md:col-span-2">
        <div className="flex items-center justify-center h-32 text-muted-foreground">
          Table content
        </div>
      </WidgetCard>
    </div>
  ),
};
