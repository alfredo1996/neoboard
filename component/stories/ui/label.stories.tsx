import type { Meta, StoryObj } from '@storybook/react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

const meta = {
  title: 'UI/Label',
  component: Label,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    children: {
      control: 'text',
      description: 'Label content',
    },
    htmlFor: {
      control: 'text',
      description: 'The id of the form element the label is associated with',
    },
  },
  args: {
    children: 'Your email address',
  },
} satisfies Meta<typeof Label>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithInput: Story = {
  render: () => (
    <div className="grid w-full max-w-sm items-center gap-1.5">
      <Label htmlFor="email">Email</Label>
      <Input type="email" id="email" placeholder="Email" />
    </div>
  ),
};
