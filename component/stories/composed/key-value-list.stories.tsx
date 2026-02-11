import type { Meta, StoryObj } from '@storybook/react';
import { KeyValueList } from '@/components/composed/key-value-list';
import { Badge } from '@/components/ui/badge';
import { StatusDot } from '@/components/composed/status-dot';

const meta = {
  title: 'Composed/KeyValueList',
  component: KeyValueList,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    orientation: {
      control: 'select',
      options: ['horizontal', 'vertical'],
    },
  },
} satisfies Meta<typeof KeyValueList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    items: [
      { key: 'Name', value: 'John Doe' },
      { key: 'Email', value: 'john@example.com' },
      { key: 'Role', value: 'Administrator' },
      { key: 'Status', value: 'Active' },
    ],
    className: 'w-[300px]',
  },
};

export const Horizontal: Story = {
  args: {
    items: [
      { key: 'Created', value: 'Jan 15, 2024' },
      { key: 'Updated', value: 'Feb 1, 2024' },
      { key: 'Version', value: '1.2.3' },
    ],
    orientation: 'horizontal',
  },
};

export const WithComponents: Story = {
  args: {
    items: [
      { key: 'Database', value: 'Neo4j' },
      { key: 'Status', value: <StatusDot variant="success" label="Connected" /> },
      { key: 'Version', value: <Badge variant="secondary">5.0</Badge> },
      { key: 'Nodes', value: '1,234,567' },
    ],
    className: 'w-[300px]',
  },
};

export const ConnectionDetails: Story = {
  args: { items: [{ key: "Host", value: "localhost:7687" }] },
  render: () => (
    <div className="w-[350px] p-4 border rounded-lg">
      <h3 className="font-semibold mb-4">Connection Details</h3>
      <KeyValueList
        items={[
          { key: 'Host', value: 'localhost:7687' },
          { key: 'Database', value: 'neo4j' },
          { key: 'Protocol', value: 'bolt' },
          { key: 'Encrypted', value: 'Yes' },
          { key: 'Status', value: <StatusDot variant="success" label="Connected" /> },
        ]}
      />
    </div>
  ),
};
