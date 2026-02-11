import type { Meta, StoryObj } from '@storybook/react';
import { LoadingOverlay } from '@/components/composed/loading-overlay';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const meta = {
  title: 'Composed/LoadingOverlay',
  component: LoadingOverlay,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    loading: {
      control: 'boolean',
    },
    text: {
      control: 'text',
    },
  },
  args: {
    loading: true,
  },
} satisfies Meta<typeof LoadingOverlay>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <LoadingOverlay {...args} className="w-[300px] h-[200px] border rounded-lg">
      <div className="p-4">
        <h3 className="font-semibold">Content Area</h3>
        <p className="text-sm text-muted-foreground">
          This content is behind the loading overlay.
        </p>
      </div>
    </LoadingOverlay>
  ),
};

export const WithText: Story = {
  args: {
    loading: true,
    text: 'Loading data...',
  },
  render: (args) => (
    <LoadingOverlay {...args} className="w-[300px] h-[200px] border rounded-lg">
      <div className="p-4">
        <h3 className="font-semibold">Dashboard</h3>
        <p className="text-sm text-muted-foreground">
          Your data will appear here.
        </p>
      </div>
    </LoadingOverlay>
  ),
};

export const OnCard: Story = {
  args: {
    loading: true,
    text: 'Fetching metrics...',
  },
  render: (args) => (
    <LoadingOverlay {...args}>
      <Card className="w-[350px]">
        <CardHeader>
          <CardTitle>Revenue Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] flex items-center justify-center">
            Chart placeholder
          </div>
        </CardContent>
      </Card>
    </LoadingOverlay>
  ),
};

export const NotLoading: Story = {
  args: {
    loading: false,
  },
  render: (args) => (
    <LoadingOverlay {...args}>
      <Card className="w-[350px]">
        <CardHeader>
          <CardTitle>Loaded Content</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            The overlay is hidden when loading is false.
          </p>
        </CardContent>
      </Card>
    </LoadingOverlay>
  ),
};
