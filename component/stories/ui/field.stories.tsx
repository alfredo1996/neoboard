import type { Meta, StoryObj } from "@storybook/react";
import { userEvent, within } from "storybook/test";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Combobox } from "@/components/composed/combobox";
import { PasswordInput } from "@/components/composed/password-input";

const meta = {
  title: "UI/Field",
  component: Field,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  args: { label: "Name", children: <Input placeholder="Your name" /> },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Field>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Rest: Story = {};

export const WithHelp: Story = {
  args: { help: "Shown on your profile." },
};

export const Optional: Story = {
  args: { label: "Nickname", optional: true },
};

export const Focus: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.tab();
    await within(canvasElement).findByLabelText("Name");
  },
};

export const WithError: Story = {
  args: { error: "Enter a name.", help: "Shown on your profile." },
};

export const Disabled: Story = {
  args: { children: <Input placeholder="Your name" disabled /> },
};

export const Textarea_: Story = {
  name: "Textarea",
  args: { label: "Notes", children: <Textarea placeholder="Anything else" /> },
};

export const PasswordField: Story = {
  name: "Password",
  args: {
    label: "Password",
    help: "Use at least 8 characters, with a letter and a number.",
    children: <PasswordInput />,
  },
};

export const SelectField: Story = {
  name: "Select",
  args: {
    label: "Role",
    children: (
      <Select defaultValue="creator">
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="admin">Admin</SelectItem>
          <SelectItem value="creator">Creator</SelectItem>
          <SelectItem value="reader">Reader</SelectItem>
        </SelectContent>
      </Select>
    ),
  },
};

export const ComboboxField: Story = {
  name: "Combobox",
  args: {
    label: "Connection",
    error: "Choose a connection.",
    children: (
      <Combobox
        className="w-full"
        options={[
          { value: "a", label: "Movies graph" },
          { value: "b", label: "Sales warehouse" },
        ]}
      />
    ),
  },
};
