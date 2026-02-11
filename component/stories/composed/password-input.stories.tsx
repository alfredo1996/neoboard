import type { Meta, StoryObj } from '@storybook/react';
import { PasswordInput } from '@/components/composed/password-input';
import { Label } from '@/components/ui/label';

const meta = {
  title: 'Composed/PasswordInput',
  component: PasswordInput,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    placeholder: {
      control: 'text',
    },
    disabled: {
      control: 'boolean',
    },
    showPasswordByDefault: {
      control: 'boolean',
      description: 'Show password text by default',
    },
  },
  args: {
    placeholder: 'Enter password',
  },
} satisfies Meta<typeof PasswordInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    placeholder: 'Enter password',
  },
};

export const WithLabel: Story = {
  render: () => (
    <div className="grid w-[300px] gap-2">
      <Label htmlFor="password">Password</Label>
      <PasswordInput id="password" placeholder="Enter your password" />
    </div>
  ),
};

export const ShowByDefault: Story = {
  args: {
    placeholder: 'Enter password',
    showPasswordByDefault: true,
    defaultValue: 'secret123',
  },
};

export const Disabled: Story = {
  args: {
    placeholder: 'Password disabled',
    disabled: true,
  },
};
