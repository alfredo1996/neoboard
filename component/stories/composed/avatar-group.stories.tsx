import type { Meta, StoryObj } from '@storybook/react';
import { AvatarGroup } from '@/components/composed/avatar-group';

const meta = {
  title: 'Composed/AvatarGroup',
  component: AvatarGroup,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    max: { control: 'number' },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
  },
} satisfies Meta<typeof AvatarGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

const sampleItems = [
  { name: 'John Doe', src: 'https://github.com/shadcn.png' },
  { name: 'Jane Smith' },
  { name: 'Bob Johnson', src: 'https://github.com/shadcn.png' },
  { name: 'Alice Williams' },
  { name: 'Charlie Brown' },
  { name: 'Diana Prince' },
];

export const Default: Story = {
  args: {
    items: sampleItems,
    max: 4,
  },
};

export const SmallSize: Story = {
  args: {
    items: sampleItems,
    max: 4,
    size: 'sm',
  },
};

export const LargeSize: Story = {
  args: {
    items: sampleItems,
    max: 4,
    size: 'lg',
  },
};

export const NoOverflow: Story = {
  args: {
    items: sampleItems.slice(0, 3),
    max: 4,
  },
};

export const ManyOverflow: Story = {
  args: {
    items: sampleItems,
    max: 2,
  },
};

export const TeamMembers: Story = {
  args: { items: [{ name: "Alice Chen" }], max: 3 },
  render: () => (
    <div className="flex items-center gap-4">
      <span className="text-sm text-muted-foreground">Team:</span>
      <AvatarGroup
        items={[
          { name: 'Alice Chen' },
          { name: 'Bob Miller' },
          { name: 'Carol White' },
          { name: 'David Lee' },
          { name: 'Eva Martinez' },
        ]}
        max={3}
      />
    </div>
  ),
};
