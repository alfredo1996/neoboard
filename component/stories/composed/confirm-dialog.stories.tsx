import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { ConfirmDialog } from "@/components/composed/confirm-dialog";
import { Button } from "@/components/ui/button";

const meta = {
  title: "Composed/ConfirmDialog",
  component: ConfirmDialog,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  args: {
    open: false,
    onOpenChange: () => {},
    action: "Delete",
    object: "dashboard",
    name: "Movie Highlights",
    consequences:
      "Its 12 widgets and its pages go with it, and the people it's shared with lose access. This can't be undone.",
    onConfirm: () => {},
  },
  argTypes: {
    action: {
      control: "text",
      description:
        "The verb. Delete, Remove, Revoke, Disable, Discard and Leave are red.",
    },
    object: {
      control: "text",
      description: 'The button reads "{action} {object}".',
    },
    name: {
      control: "text",
      description: 'The title reads "{action} {name}?".',
    },
    consequences: {
      control: "text",
    },
    cancelText: {
      control: "text",
    },
  },
} satisfies Meta<typeof ConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

function Asked(args: React.ComponentProps<typeof ConfirmDialog>) {
  const [open, setOpen] = React.useState(true);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Ask again
      </Button>
      <ConfirmDialog {...args} open={open} onOpenChange={setOpen} />
    </>
  );
}

export const Destructive: Story = {
  render: (args) => <Asked {...args} />,
};

export const WithoutName: Story = {
  args: {
    action: "Remove",
    object: "widget",
    name: undefined,
    consequences:
      "It leaves this page when you save. The rest of the dashboard is unchanged.",
  },
  render: (args) => <Asked {...args} />,
};

export const NoObject: Story = {
  args: {
    action: "Leave without saving",
    object: undefined,
    name: undefined,
    consequences: "Your changes to Movie Highlights are lost.",
    cancelText: "Stay",
  },
  render: (args) => <Asked {...args} />,
};

/** A lossy action that is not a delete: the red fill comes from `destructive`. */
export const SyncWithTemplate: Story = {
  args: {
    action: "Sync",
    object: "widget",
    name: "Movies per year with its template",
    consequences:
      "Its query, chart type and options are replaced by the template's.",
    destructive: true,
  },
  render: (args) => <Asked {...args} />,
};

export const SharedDashboard: Story = {
  args: {
    action: "Delete",
    object: "dashboard",
    name: "Movie Highlights",
    consequences:
      "Its 12 widgets and 3 pages go with it, and the 3 people it's shared with lose access. This can't be undone.",
  },
  render: (args) => <Asked {...args} />,
};
