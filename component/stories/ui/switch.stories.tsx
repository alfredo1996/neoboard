import type { Meta, StoryObj } from '@storybook/react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

const meta = {
  title: 'UI/Switch',
  component: Switch,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    checked: {
      control: 'boolean',
      description: 'The controlled checked state',
    },
    disabled: {
      control: 'boolean',
      description: 'Whether the switch is disabled',
    },
    required: {
      control: 'boolean',
      description: 'Whether the switch is required in a form',
    },
  },
  args: {
    disabled: false,
    required: false,
  },
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { id: 'airplane-mode' },
};

export const WithLabel: Story = {
  render: (args) => (
    <div className="flex items-center space-x-2">
      <Switch id="airplane-mode" {...args} />
      <Label htmlFor="airplane-mode">Airplane Mode</Label>
    </div>
  ),
};

export const Disabled: Story = {
  args: { disabled: true },
};

export const Checked: Story = {
  args: { checked: true },
};
