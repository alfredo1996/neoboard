import type { Meta, StoryObj } from '@storybook/react';
import { Slider } from './slider';

const meta = {
  title: 'UI/Slider',
  component: Slider,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    defaultValue: {
      control: 'object',
      description: 'The default value(s) of the slider. Use array for range sliders.',
    },
    max: {
      control: { type: 'number', min: 1, max: 1000 },
      description: 'The maximum value of the slider',
    },
    min: {
      control: { type: 'number', min: 0, max: 999 },
      description: 'The minimum value of the slider',
    },
    step: {
      control: { type: 'number', min: 1, max: 100 },
      description: 'The step increment between values',
    },
    disabled: {
      control: 'boolean',
      description: 'Whether the slider is disabled',
    },
  },
  args: {
    defaultValue: [50],
    max: 100,
    min: 0,
    step: 1,
    disabled: false,
    className: 'w-[60%]',
  },
} satisfies Meta<typeof Slider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Range: Story = {
  args: { defaultValue: [25, 75] },
};

export const WithSteps: Story = {
  args: { step: 10 },
};

export const Disabled: Story = {
  args: { disabled: true },
};

export const CustomRange: Story = {
  args: { defaultValue: [20], min: 0, max: 200, step: 5 },
};
