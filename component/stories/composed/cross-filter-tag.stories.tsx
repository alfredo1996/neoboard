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
    field: 'category',
    value: 'Electronics',
  },
};

export const WithRemove: Story = {
  args: {
    field: 'region',
    value: 'North America',
    onRemove: () => console.log('Remove'),
  },
};

export const Multiple: Story = {
  args: { field: '', value: '' },
  render: () => (
    <div className="flex flex-wrap gap-2">
      <CrossFilterTag
        field="category"
        value="Electronics"
        onRemove={() => {}}
      />
      <CrossFilterTag
        field="year"
        value="2024"
        onRemove={() => {}}
      />
      <CrossFilterTag
        field="region"
        value="Europe"
        onRemove={() => {}}
      />
    </div>
  ),
};

export const ReadOnly: Story = {
  args: {
    field: 'status',
    value: 'Active',
  },
};
