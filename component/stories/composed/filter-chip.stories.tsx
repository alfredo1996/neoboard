import type { Meta, StoryObj } from '@storybook/react';
import * as React from 'react';
import { FilterChip } from '@/components/composed/filter-chip';

const meta = {
  title: 'Composed/FilterChip',
  component: FilterChip,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    label: { control: 'text' },
    value: { control: 'text' },
  },
} satisfies Meta<typeof FilterChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: 'Status',
    value: 'Active',
  },
};

export const Removable: Story = {
  args: {
    label: 'Category',
    value: 'Electronics',
    onRemove: () => console.log('Remove clicked'),
  },
};

export const FilterBar: Story = {
  args: { label: "Status" },
  render: function FilterBarDemo() {
    const [filters, setFilters] = React.useState([
      { id: 1, label: 'Status', value: 'Active' },
      { id: 2, label: 'Category', value: 'Electronics' },
      { id: 3, label: 'Date', value: 'Last 7 days' },
    ]);

    const removeFilter = (id: number) => {
      setFilters(filters.filter((f) => f.id !== id));
    };

    return (
      <div className="flex flex-wrap gap-2">
        {filters.map((filter) => (
          <FilterChip
            key={filter.id}
            label={filter.label}
            value={filter.value}
            onRemove={() => removeFilter(filter.id)}
          />
        ))}
      </div>
    );
  },
};
