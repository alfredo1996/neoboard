import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { ChartTypePicker } from '@/components/composed/chart-type-picker';

const meta = {
  title: 'Composed/ChartTypePicker',
  component: ChartTypePicker,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta<typeof ChartTypePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { value: 'bar' },
  render: () => {
    const [value, setValue] = useState('bar');
    return (
      <div className="w-[300px]">
        <ChartTypePicker value={value} onValueChange={setValue} />
      </div>
    );
  },
};

export const NoSelection: Story = {
  args: {},
  render: () => (
    <div className="w-[300px]">
      <ChartTypePicker />
    </div>
  ),
};
