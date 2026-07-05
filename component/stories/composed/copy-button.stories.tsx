import type { Meta, StoryObj } from "@storybook/react";
import { CopyButton } from "@/components/composed/copy-button";

const meta = {
  title: "Composed/CopyButton",
  component: CopyButton,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "outline", "ghost", "secondary"],
    },
    size: {
      control: "select",
      options: ["default", "sm", "lg", "icon"],
    },
  },
} satisfies Meta<typeof CopyButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { value: "bolt://localhost:7687" },
};

export const CustomLabel: Story = {
  args: { value: "NB-TEMP-PASSWORD-123", label: "Copy password" },
};

export const InContext: Story = {
  args: { value: "postgresql://localhost:5432/neoboard" },
  render: () => (
    <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 font-mono text-sm">
      postgresql://localhost:5432/neoboard
      <CopyButton value="postgresql://localhost:5432/neoboard" size="sm" />
    </div>
  ),
};
