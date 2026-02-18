import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { ColorPicker } from '@/components/composed/color-picker';

const meta = {
  title: 'Composed/ColorPicker',
  component: ColorPicker,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta<typeof ColorPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { value: '#3b82f6' },
  render: () => {
    const [color, setColor] = useState('#3b82f6');
    return <ColorPicker value={color} onValueChange={setColor} />;
  },
};
