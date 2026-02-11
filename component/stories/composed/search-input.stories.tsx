import type { Meta, StoryObj } from '@storybook/react';
import * as React from 'react';
import { SearchInput } from '@/components/composed/search-input';

const meta = {
  title: 'Composed/SearchInput',
  component: SearchInput,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    placeholder: {
      control: 'text',
    },
    disabled: {
      control: 'boolean',
    },
  },
  args: {
    placeholder: 'Search...',
  },
} satisfies Meta<typeof SearchInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    placeholder: 'Search...',
  },
};

export const WithValue: Story = {
  args: {
    placeholder: 'Search...',
    value: 'React components',
  },
};

export const Controlled: Story = {
  render: function ControlledSearchInput() {
    const [value, setValue] = React.useState('');
    return (
      <div className="w-[300px] space-y-2">
        <SearchInput
          value={value}
          onChange={setValue}
          placeholder="Type to search..."
          onSearch={(v) => console.log('Search:', v)}
        />
        <p className="text-sm text-muted-foreground">
          Value: {value || '(empty)'}
        </p>
      </div>
    );
  },
};

export const Disabled: Story = {
  args: {
    placeholder: 'Search disabled',
    disabled: true,
  },
};
