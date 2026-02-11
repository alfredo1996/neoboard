import type { Meta, StoryObj } from '@storybook/react';
import { LoadingButton } from '@/components/composed/loading-button';

const meta = {
  title: 'Composed/LoadingButton',
  component: LoadingButton,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'],
    },
    size: {
      control: 'select',
      options: ['default', 'sm', 'lg', 'icon'],
    },
    loading: {
      control: 'boolean',
      description: 'Shows loading spinner when true',
    },
    loadingText: {
      control: 'text',
      description: 'Text to display while loading',
    },
    disabled: {
      control: 'boolean',
    },
  },
  args: {
    children: 'Submit',
    loading: false,
    disabled: false,
  },
} satisfies Meta<typeof LoadingButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: 'Submit',
  },
};

export const Loading: Story = {
  args: {
    children: 'Submit',
    loading: true,
  },
};

export const LoadingWithText: Story = {
  args: {
    children: 'Save',
    loading: true,
    loadingText: 'Saving...',
  },
};

export const Variants: Story = {
  render: () => (
    <div className="flex gap-4 flex-wrap">
      <LoadingButton>Default</LoadingButton>
      <LoadingButton loading>Loading</LoadingButton>
      <LoadingButton variant="destructive" loading>Delete</LoadingButton>
      <LoadingButton variant="outline" loading loadingText="Processing...">Process</LoadingButton>
    </div>
  ),
};
