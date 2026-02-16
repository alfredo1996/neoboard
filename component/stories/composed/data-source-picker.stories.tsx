import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { DataSourcePicker } from '@/components/composed/data-source-picker';

const meta = {
  title: 'Composed/DataSourcePicker',
  component: DataSourcePicker,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta<typeof DataSourcePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

const sampleOptions = [
  { id: 'ds1', name: 'Production DB', type: 'Neo4j' },
  { id: 'ds2', name: 'Staging DB', type: 'PostgreSQL' },
  { id: 'ds3', name: 'Local Dev', type: 'Neo4j' },
  { id: 'ds4', name: 'Analytics', type: 'BigQuery' },
];

export const Default: Story = {
  args: {
    options: sampleOptions,
  },
};

export const WithValue: Story = {
  args: {
    options: sampleOptions,
    value: 'ds1',
  },
};

export const Controlled: Story = {
  args: { options: sampleOptions },
  render: () => {
    const [value, setValue] = useState('ds1');
    return (
      <DataSourcePicker
        options={sampleOptions}
        value={value}
        onValueChange={setValue}
      />
    );
  },
};

export const Empty: Story = {
  args: {
    options: [],
  },
};

export const CustomPlaceholder: Story = {
  args: {
    options: sampleOptions,
    placeholder: 'Choose a database...',
  },
};

export const NoTypes: Story = {
  args: {
    options: [
      { id: 'a', name: 'Database A' },
      { id: 'b', name: 'Database B' },
      { id: 'c', name: 'Database C' },
    ],
  },
};
