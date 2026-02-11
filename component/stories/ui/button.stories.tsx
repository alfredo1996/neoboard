import type { Meta, StoryObj } from '@storybook/react';
import { ArrowUpIcon, MailIcon, Loader2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';

const meta = {
  title: 'UI/Button',
  component: Button,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'],
      description: 'The visual style variant of the button',
    },
    size: {
      control: 'select',
      options: ['default', 'sm', 'lg', 'icon'],
      description: 'The size of the button',
    },
    disabled: {
      control: 'boolean',
      description: 'Whether the button is disabled',
    },
    asChild: {
      control: 'boolean',
      description: 'Render as a child element using Radix Slot',
    },
    children: {
      control: 'text',
      description: 'Button content',
    },
  },
  args: {
    variant: 'default',
    size: 'default',
    disabled: false,
    children: 'Button',
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Button>Default</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="link">Link</Button>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
      <Button size="icon" aria-label="Mail">
        <MailIcon />
      </Button>
    </div>
  ),
};

export const WithIcon: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Button>
        <MailIcon />
        Login with Email
      </Button>
      <Button variant="outline">
        <MailIcon />
        Login with Email
      </Button>
    </div>
  ),
};

export const Loading: Story = {
  render: () => (
    <Button disabled>
      <Loader2Icon className="animate-spin" />
      Please wait
    </Button>
  ),
};

export const IconButton: Story = {
  args: {
    variant: 'outline',
    size: 'icon',
    children: undefined,
  },
  render: (args) => (
    <Button {...args} aria-label="Submit">
      <ArrowUpIcon />
    </Button>
  ),
};

export const Disabled: Story = {
  args: {
    children: 'Disabled',
    disabled: true,
  },
};
