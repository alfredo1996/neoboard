import type { Meta, StoryObj } from '@storybook/react';
import { ConnectionCard } from '@/components/composed/connection-card';

const meta = {
  title: 'Composed/ConnectionCard',
  component: ConnectionCard,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta<typeof ConnectionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Connected: Story = {
  args: {
    name: 'Production DB',
    host: 'db.example.com',
    database: 'movies',
    status: 'connected',
  },
};

export const Disconnected: Story = {
  args: {
    name: 'Staging DB',
    host: 'staging.example.com',
    database: 'test',
    status: 'disconnected',
  },
};

export const WithActions: Story = {
  args: {
    name: 'Production DB',
    host: 'db.example.com',
    database: 'movies',
    status: 'connected',
    onEdit: () => console.log('Edit'),
    onDelete: () => console.log('Delete'),
    onTest: () => console.log('Test'),
  },
};

export const Active: Story = {
  args: {
    name: 'Production DB',
    host: 'db.example.com',
    database: 'movies',
    status: 'connected',
    active: true,
    onClick: () => console.log('Clicked'),
    onEdit: () => console.log('Edit'),
    onDelete: () => console.log('Delete'),
  },
};

export const Connecting: Story = {
  args: {
    name: 'New Connection',
    host: 'new.example.com',
    status: 'connecting',
  },
};

export const ErrorState: Story = {
  args: {
    name: 'Broken Connection',
    host: 'invalid.host',
    status: 'error',
    onTest: () => console.log('Retry'),
    onDelete: () => console.log('Delete'),
  },
};

export const CardList: Story = {
  args: { name: '', host: '', status: 'connected' },
  render: () => (
    <div className="w-[400px] space-y-3">
      <ConnectionCard
        name="Production DB"
        host="db.example.com"
        database="movies"
        status="connected"
        active
        onClick={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        onTest={() => {}}
      />
      <ConnectionCard
        name="Staging DB"
        host="staging.example.com"
        database="test"
        status="disconnected"
        onClick={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
      />
      <ConnectionCard
        name="Local Dev"
        host="localhost"
        status="connecting"
        onClick={() => {}}
      />
    </div>
  ),
};
