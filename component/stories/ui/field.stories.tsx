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

const LONG_LABEL =
  "PostgreSQL Ecommerce PostgreSQL Ecommerce PostgreSQL Ecommerce (demo, read)";

// #2370: a long selected label must ellipsize inside its column, not push the
// control under the one beside it. Needs real layout, so it is a play test.
export const LongValueStaysInColumn: Story = {
  decorators: [
    (Story) => (
      <div className="w-[640px]">
        <Story />
      </div>
    ),
  ],
  render: () => (
    <div className="grid grid-cols-2 gap-4" data-testid="grid">
      <Field label="Connection">
        <Combobox
          className="w-full"
          value="a"
          options={[{ value: "a", label: LONG_LABEL }]}
        />
      </Field>
      <Field label="Chart type">
        <Input placeholder="Bar" />
      </Field>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole("combobox");
    const column = within(canvasElement)
      .getByTestId("grid")
      .firstElementChild!.getBoundingClientRect();
    const box = trigger.getBoundingClientRect();
    if (box.right > column.right + 0.5) {
      throw new Error(
        `trigger overflows its column by ${box.right - column.right}px`,
      );
    }
    const chevron = trigger.querySelector("svg")!.getBoundingClientRect();
    if (chevron.right > box.right + 0.5) {
      throw new Error("chevron is pushed outside the trigger");
    }
    const label = trigger.querySelector("span")!;
    if (label.scrollWidth <= label.clientWidth) {
      throw new Error("long label is not ellipsized");
    }
  },
};
