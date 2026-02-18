import type { Meta, StoryObj } from '@storybook/react';
import { ConnectionStatus } from '@/components/composed/connection-status';

const meta = {
  title: 'Composed/ConnectionStatus',
  component: ConnectionStatus,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta<typeof ConnectionStatus>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Connected: Story = {
  args: { status: 'connected' },
};

export const Disconnected: Story = {
  args: { status: 'disconnected' },
};

export const Connecting: Story = {
  args: { status: 'connecting' },
};

export const Error: Story = {
  args: { status: 'error' },
};

export const AllStates: Story = {
  args: { status: 'connected' },
  render: () => (
    <div className="flex flex-wrap gap-3">
      <ConnectionStatus status="connected" />
      <ConnectionStatus status="disconnected" />
      <ConnectionStatus status="connecting" />
      <ConnectionStatus status="error" />
    </div>
  ),
};
