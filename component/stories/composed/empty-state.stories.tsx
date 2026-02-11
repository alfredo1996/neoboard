import type { Meta, StoryObj } from '@storybook/react';
import { FileX, Inbox, Search, Users } from 'lucide-react';
import { EmptyState } from '@/components/composed/empty-state';
import { Button } from '@/components/ui/button';

const meta = {
  title: 'Composed/EmptyState',
  component: EmptyState,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    title: {
      control: 'text',
    },
    description: {
      control: 'text',
    },
  },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: 'No items found',
    description: 'Get started by creating a new item.',
  },
};

export const WithIcon: Story = {
  args: {
    icon: <Inbox className="h-12 w-12" />,
    title: 'Your inbox is empty',
    description: 'New messages will appear here.',
  },
};

export const WithAction: Story = {
  args: {
    icon: <FileX className="h-12 w-12" />,
    title: 'No files uploaded',
    description: 'Upload your first file to get started.',
    action: <Button>Upload File</Button>,
  },
};

export const SearchNoResults: Story = {
  args: {
    icon: <Search className="h-12 w-12" />,
    title: 'No results found',
    description: 'Try adjusting your search or filter to find what you\'re looking for.',
    action: <Button variant="outline">Clear Filters</Button>,
  },
};

export const NoUsers: Story = {
  args: {
    icon: <Users className="h-12 w-12" />,
    title: 'No team members',
    description: 'Invite team members to collaborate on this project.',
    action: <Button>Invite Members</Button>,
  },
};
