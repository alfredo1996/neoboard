import type { Meta, StoryObj } from '@storybook/react';
import { Slider } from './slider';

const meta = {
  title: 'UI/Slider',
  component: Slider,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Slider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    defaultValue: [50],
    max: 100,
    step: 1,
    className: 'w-[60%]',
  },
};

export const Range: Story = {
  args: {
    defaultValue: [25, 75],
    max: 100,
    step: 1,
    className: 'w-[60%]',
  },
};

export const WithSteps: Story = {
  args: {
    defaultValue: [50],
    max: 100,
    step: 10,
    className: 'w-[60%]',
  },
};
