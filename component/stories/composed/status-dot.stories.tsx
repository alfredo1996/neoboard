import type { Meta, StoryObj } from '@storybook/react';
import { StatusDot } from '@/components/composed/status-dot';

const meta = {
  title: 'Composed/StatusDot',
  component: StatusDot,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'success', 'warning', 'error', 'info'],
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
    pulse: {
      control: 'boolean',
    },
    label: {
      control: 'text',
    },
  },
  args: {
    variant: 'default',
    size: 'md',
  },
} satisfies Meta<typeof StatusDot>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};

export const WithLabel: Story = {
  args: {
    variant: 'success',
    label: 'Connected',
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className="space-y-3">
      <StatusDot variant="default" label="Default" />
      <StatusDot variant="success" label="Success" />
      <StatusDot variant="warning" label="Warning" />
      <StatusDot variant="error" label="Error" />
      <StatusDot variant="info" label="Info" />
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-6">
      <StatusDot variant="success" size="sm" label="Small" />
      <StatusDot variant="success" size="md" label="Medium" />
      <StatusDot variant="success" size="lg" label="Large" />
    </div>
  ),
};

export const Pulsing: Story = {
  render: () => (
    <div className="space-y-3">
      <StatusDot variant="success" pulse label="Live" />
      <StatusDot variant="warning" pulse label="Processing" />
      <StatusDot variant="error" pulse label="Alert" />
    </div>
  ),
};

export const ConnectionStatus: Story = {
  render: () => (
    <div className="space-y-2">
      <div className="flex items-center justify-between p-2 border rounded">
        <span>Neo4j Database</span>
        <StatusDot variant="success" label="Connected" />
      </div>
      <div className="flex items-center justify-between p-2 border rounded">
        <span>PostgreSQL</span>
        <StatusDot variant="warning" label="Reconnecting" pulse />
      </div>
      <div className="flex items-center justify-between p-2 border rounded">
        <span>Redis Cache</span>
        <StatusDot variant="error" label="Disconnected" />
      </div>
    </div>
  ),
};
