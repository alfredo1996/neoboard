import type { Meta, StoryObj } from "@storybook/react";
import { Badge } from "@/components/ui/badge";

const meta = {
  title: "UI/Badge",
  component: Badge,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  args: { children: "12" },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A count: tabular numbers on the neutral fill. */
export const Default: Story = {};

export const Counts: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge>3</Badge>
      <Badge>12</Badge>
      <Badge>99+</Badge>
    </div>
  ),
};
