import type { Meta, StoryObj } from "@storybook/react";
import { SettingsSection } from "@/components/kit/settings-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Args = {
  title: string;
  description: string;
  withFooter: boolean;
};

const meta = {
  title: "Kit/SettingsSection",
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  argTypes: {
    title: { control: "text" },
    description: { control: "text" },
    withFooter: { control: "boolean" },
  },
  args: {
    title: "Display name",
    description: "How your name appears on dashboards you share.",
    withFooter: true,
  },
  render: ({ title, description, withFooter }: Args) => (
    <SettingsSection
      title={title}
      description={description}
      footer={withFooter ? <Button size="sm">Save name</Button> : undefined}
    >
      <div className="space-y-1.5">
        <Label htmlFor="kit-name">Name</Label>
        <Input id="kit-name" defaultValue="Alice Demo" />
      </div>
    </SettingsSection>
  ),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const NoFooter: Story = { args: { withFooter: false } };
