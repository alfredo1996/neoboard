import type { Meta, StoryObj } from '@storybook/react';
import * as React from 'react';
import { ConfirmDialog } from '@/components/composed/confirm-dialog';
import { Button } from '@/components/ui/button';

const meta = {
  title: 'Composed/ConfirmDialog',
  component: ConfirmDialog,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  args: {
    open: false,
    onOpenChange: () => {},
    title: 'Confirm',
    onConfirm: () => {},
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'destructive'],
      description: 'Visual style of the confirm button',
    },
    title: {
      control: 'text',
    },
    description: {
      control: 'text',
    },
    confirmText: {
      control: 'text',
    },
    cancelText: {
      control: 'text',
    },
  },
} satisfies Meta<typeof ConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: function DefaultDialog() {
    const [open, setOpen] = React.useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open Dialog</Button>
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title="Confirm Action"
          description="Are you sure you want to proceed with this action?"
          onConfirm={() => console.log('Confirmed!')}
        />
      </>
    );
  },
};

export const Destructive: Story = {
  render: function DestructiveDialog() {
    const [open, setOpen] = React.useState(false);
    return (
      <>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          Delete Item
        </Button>
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title="Delete Item"
          description="This action cannot be undone. This will permanently delete the item."
          confirmText="Delete"
          cancelText="Cancel"
          variant="destructive"
          onConfirm={() => console.log('Deleted!')}
        />
      </>
    );
  },
};

export const CustomText: Story = {
  render: function CustomDialog() {
    const [open, setOpen] = React.useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Save Draft</Button>
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title="Save as Draft?"
          description="Your changes will be saved but not published."
          confirmText="Save Draft"
          cancelText="Keep Editing"
          onConfirm={() => console.log('Saved!')}
        />
      </>
    );
  },
};
