import type { Meta, StoryObj } from '@storybook/react';
import { BadgeCheckIcon } from 'lucide-react';
import { Badge } from './badge';

const meta = {
  title: 'UI/Badge',
  component: Badge,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'secondary', 'destructive', 'outline'],
      description: 'The visual style variant of the badge',
    },
    children: {
      control: 'text',
      description: 'Badge content',
    },
  },
  args: {
    variant: 'default',
    children: 'Badge',
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Secondary: Story = {
  args: { variant: 'secondary', children: 'Secondary' },
};

export const Destructive: Story = {
  args: { variant: 'destructive', children: 'Destructive' },
};

export const Outline: Story = {
  args: { variant: 'outline', children: 'Outline' },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge>Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="destructive">Destructive</Badge>
      <Badge variant="outline">Outline</Badge>
    </div>
  ),
};

export const WithIcon: Story = {
  render: () => (
    <Badge variant="secondary" className="bg-blue-500 text-white dark:bg-blue-600">
      <BadgeCheckIcon />
      Verified
    </Badge>
  ),
};

export const NumberBadges: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge className="h-5 min-w-5 rounded-full px-1 font-mono tabular-nums">8</Badge>
      <Badge className="h-5 min-w-5 rounded-full px-1 font-mono tabular-nums" variant="destructive">99</Badge>
      <Badge className="h-5 min-w-5 rounded-full px-1 font-mono tabular-nums" variant="outline">20+</Badge>
    </div>
  ),
};
