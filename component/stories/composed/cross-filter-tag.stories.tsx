import type { Meta, StoryObj } from '@storybook/react';
import { CrossFilterTag } from '@/components/composed/cross-filter-tag';

const meta = {
  title: 'Composed/CrossFilterTag',
  component: CrossFilterTag,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta<typeof CrossFilterTag>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    source: 'Bar Chart',
    field: 'category',
    value: 'Electronics',
  },
};

export const WithRemove: Story = {
  args: {
    source: 'Pie Chart',
    field: 'region',
    value: 'North America',
    onRemove: () => console.log('Remove'),
  },
};

export const Multiple: Story = {
  args: { source: '', field: '', value: '' },
  render: () => (
    <div className="flex flex-wrap gap-2">
      <CrossFilterTag
        source="Bar Chart"
        field="category"
        value="Electronics"
        onRemove={() => {}}
      />
      <CrossFilterTag
        source="Line Chart"
        field="year"
        value="2024"
        onRemove={() => {}}
      />
      <CrossFilterTag
        source="Pie Chart"
        field="region"
        value="Europe"
        onRemove={() => {}}
      />
    </div>
  ),
};

export const ReadOnly: Story = {
  args: {
    source: 'Dashboard',
    field: 'status',
    value: 'Active',
  },
};
