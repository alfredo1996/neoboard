import type { Meta, StoryObj } from '@storybook/react';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

const meta = {
  title: 'UI/RadioGroup',
  component: RadioGroup,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    defaultValue: {
      control: 'text',
      description: 'The default selected value',
    },
    disabled: {
      control: 'boolean',
      description: 'Whether the radio group is disabled',
    },
    orientation: {
      control: 'radio',
      options: ['horizontal', 'vertical'],
      description: 'The orientation of the radio group',
    },
    required: {
      control: 'boolean',
      description: 'Whether a selection is required',
    },
  },
  args: {
    defaultValue: 'comfortable',
    disabled: false,
  },
} satisfies Meta<typeof RadioGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <RadioGroup {...args}>
      <div className="flex items-center gap-3">
        <RadioGroupItem value="default" id="r1" />
        <Label htmlFor="r1">Default</Label>
      </div>
      <div className="flex items-center gap-3">
        <RadioGroupItem value="comfortable" id="r2" />
        <Label htmlFor="r2">Comfortable</Label>
      </div>
      <div className="flex items-center gap-3">
        <RadioGroupItem value="compact" id="r3" />
        <Label htmlFor="r3">Compact</Label>
      </div>
    </RadioGroup>
  ),
};

export const Horizontal: Story = {
  args: { orientation: 'horizontal' },
  render: (args) => (
    <RadioGroup {...args} className="flex flex-row gap-4">
      <div className="flex items-center gap-2">
        <RadioGroupItem value="small" id="h1" />
        <Label htmlFor="h1">Small</Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="medium" id="h2" />
        <Label htmlFor="h2">Medium</Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="large" id="h3" />
        <Label htmlFor="h3">Large</Label>
      </div>
    </RadioGroup>
  ),
};

export const Disabled: Story = {
  args: { disabled: true, defaultValue: 'comfortable' },
  render: (args) => (
    <RadioGroup {...args}>
      <div className="flex items-center gap-3">
        <RadioGroupItem value="default" id="d1" />
        <Label htmlFor="d1">Default</Label>
      </div>
      <div className="flex items-center gap-3">
        <RadioGroupItem value="comfortable" id="d2" />
        <Label htmlFor="d2">Comfortable</Label>
      </div>
      <div className="flex items-center gap-3">
        <RadioGroupItem value="compact" id="d3" />
        <Label htmlFor="d3">Compact</Label>
      </div>
    </RadioGroup>
  ),
};
