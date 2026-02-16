import type { Meta, StoryObj } from '@storybook/react';
import {
  ConnectionForm,
  neo4jConnectionFields,
  postgresConnectionFields,
} from '@/components/composed/connection-form';

const meta = {
  title: 'Composed/ConnectionForm',
  component: ConnectionForm,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta<typeof ConnectionForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Neo4j: Story = {
  args: {
    fields: neo4jConnectionFields,
    onTest: (values) => console.log('Testing:', values),
    onSubmit: (values) => console.log('Submitting:', values),
  },
  render: (args) => (
    <div className="max-w-lg">
      <ConnectionForm {...args} />
    </div>
  ),
};

export const PostgreSQL: Story = {
  args: {
    fields: postgresConnectionFields,
    onTest: (values) => console.log('Testing:', values),
    onSubmit: (values) => console.log('Submitting:', values),
  },
  render: (args) => (
    <div className="max-w-lg">
      <ConnectionForm {...args} />
    </div>
  ),
};

export const CustomLabels: Story = {
  args: {
    fields: neo4jConnectionFields,
    submitLabel: 'Save Connection',
    testLabel: 'Verify',
    onTest: (values) => console.log('Testing:', values),
    onSubmit: (values) => console.log('Submitting:', values),
  },
  render: (args) => (
    <div className="max-w-lg">
      <ConnectionForm {...args} />
    </div>
  ),
};

export const Testing: Story = {
  args: {
    fields: neo4jConnectionFields,
    testing: true,
    onTest: () => {},
    onSubmit: () => {},
  },
  render: (args) => (
    <div className="max-w-lg">
      <ConnectionForm {...args} />
    </div>
  ),
};

export const Submitting: Story = {
  args: {
    fields: neo4jConnectionFields,
    submitting: true,
    onSubmit: () => {},
  },
  render: (args) => (
    <div className="max-w-lg">
      <ConnectionForm {...args} />
    </div>
  ),
};
