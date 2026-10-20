import type { Meta, StoryObj } from "@storybook/react";
import { Tag } from "@/components/ui/tag";

const meta = {
  title: "UI/Tag",
  component: Tag,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  args: { children: "Shared" },
} satisfies Meta<typeof Tag>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Removable: Story = {
  args: { children: "Sales", onRemove: () => {} },
};

export const Group: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-1">
      <Tag>Shared</Tag>
      <Tag>Public</Tag>
      <Tag onRemove={() => {}}>Sales</Tag>
      <Tag onRemove={() => {}}>Marketing</Tag>
    </div>
  ),
};
