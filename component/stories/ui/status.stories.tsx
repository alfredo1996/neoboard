import type { Meta, StoryObj } from "@storybook/react";
import { Status } from "@/components/ui/status";

const meta = {
  title: "UI/Status",
  component: Status,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    tone: { control: "select", options: ["good", "none", "pending", "failed"] },
  },
  args: { tone: "good", children: "Connected" },
} satisfies Meta<typeof Status>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Good: Story = {};

export const None: Story = {
  args: { tone: "none", children: "Not checked" },
};

export const Pending: Story = {
  args: { tone: "pending", children: "Checking…" },
};

export const Failed: Story = {
  args: { tone: "failed", children: "Can't connect" },
};

/** Each tone has its own shape, so colour is never the only signal. */
export const AllTones: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-2">
      <Status tone="good">Connected</Status>
      <Status tone="none">Not checked</Status>
      <Status tone="pending">Checking…</Status>
      <Status tone="failed">Can&apos;t connect</Status>
    </div>
  ),
};
