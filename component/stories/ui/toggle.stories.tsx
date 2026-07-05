import type { Meta, StoryObj } from "@storybook/react";
import { Bold, Italic, Underline } from "lucide-react";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const meta = {
  title: "UI/Toggle",
  component: Toggle,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "outline"],
      description: "Rest treatment — mirrors Button ghost/outline",
    },
    size: {
      control: "select",
      options: ["sm", "default", "lg"],
    },
    disabled: { control: "boolean" },
  },
} satisfies Meta<typeof Toggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Toggle {...args} aria-label="Toggle bold">
      <Bold />
    </Toggle>
  ),
};

export const Outline: Story = {
  args: { variant: "outline" },
  render: (args) => (
    <Toggle {...args} aria-label="Toggle italic">
      <Italic />
    </Toggle>
  ),
};

export const WithText: Story = {
  render: (args) => (
    <Toggle {...args} aria-label="Toggle italic">
      <Italic />
      Italic
    </Toggle>
  ),
};

export const Pressed: Story = {
  render: (args) => (
    <Toggle {...args} pressed aria-label="Toggle bold">
      <Bold />
      Pressed
    </Toggle>
  ),
};

export const Disabled: Story = {
  args: { disabled: true },
  render: (args) => (
    <Toggle {...args} aria-label="Toggle underline">
      <Underline />
    </Toggle>
  ),
};

export const GroupSingle: Story = {
  render: () => (
    <ToggleGroup type="single" defaultValue="center" variant="outline">
      <ToggleGroupItem value="left">Left</ToggleGroupItem>
      <ToggleGroupItem value="center">Center</ToggleGroupItem>
      <ToggleGroupItem value="right">Right</ToggleGroupItem>
    </ToggleGroup>
  ),
};

export const GroupMultiple: Story = {
  render: () => (
    <ToggleGroup type="multiple" defaultValue={["bold"]}>
      <ToggleGroupItem value="bold" aria-label="Bold">
        <Bold />
      </ToggleGroupItem>
      <ToggleGroupItem value="italic" aria-label="Italic">
        <Italic />
      </ToggleGroupItem>
      <ToggleGroupItem value="underline" aria-label="Underline">
        <Underline />
      </ToggleGroupItem>
    </ToggleGroup>
  ),
};
