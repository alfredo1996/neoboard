import type { Meta, StoryObj } from '@storybook/react';
import { CopyButton } from '@/components/composed/copy-button';

const meta = {
  title: 'Composed/CopyButton',
  component: CopyButton,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    value: {
      control: 'text',
      description: 'The value to copy to clipboard',
    },
  },
} satisfies Meta<typeof CopyButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    value: 'Hello, World!',
  },
};

export const WithCode: Story = {
  args: { value: "npm install @shadcn/ui" },
  render: () => (
    <div className="flex items-center gap-2 rounded-md bg-muted p-3">
      <code className="text-sm">npm install @shadcn/ui</code>
      <CopyButton value="npm install @shadcn/ui" />
    </div>
  ),
};

export const InlineUsage: Story = {
  args: { value: "sk-1234567890abcdef" },
  render: () => (
    <div className="space-y-2">
      <div className="flex items-center justify-between rounded-md border p-3">
        <span className="text-sm">API Key: sk-xxx...xxx</span>
        <CopyButton value="sk-1234567890abcdef" />
      </div>
      <div className="flex items-center justify-between rounded-md border p-3">
        <span className="text-sm">User ID: user_123</span>
        <CopyButton value="user_123" />
      </div>
    </div>
  ),
};
