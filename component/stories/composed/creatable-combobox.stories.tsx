import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { CreatableCombobox } from "@/components/composed/creatable-combobox";

const parameterNames = [
  "selectedMovie",
  "selectedYear",
  "department",
  "region",
  "search",
];

const meta = {
  title: "Composed/CreatableCombobox",
  component: CreatableCombobox,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    placeholder: { control: "text" },
    disabled: { control: "boolean" },
  },
} satisfies Meta<typeof CreatableCombobox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => {
    const [value, setValue] = useState("");
    return (
      <div className="w-[300px]">
        <CreatableCombobox {...args} value={value} onChange={setValue} />
        <p className="mt-2 text-xs text-muted-foreground">
          Current value: <code>{value || "(empty)"}</code>
        </p>
      </div>
    );
  },
  args: {
    suggestions: parameterNames,
    placeholder: "Type or select parameter...",
  },
};

export const WithExistingValue: Story = {
  render: (args) => {
    const [value, setValue] = useState("selectedMovie");
    return (
      <div className="w-[300px]">
        <CreatableCombobox {...args} value={value} onChange={setValue} />
        <p className="mt-2 text-xs text-muted-foreground">
          Current value: <code>{value || "(empty)"}</code>
        </p>
      </div>
    );
  },
  args: {
    suggestions: parameterNames,
  },
};

export const EmptySuggestions: Story = {
  render: (args) => {
    const [value, setValue] = useState("");
    return (
      <div className="w-[300px]">
        <CreatableCombobox {...args} value={value} onChange={setValue} />
        <p className="mt-2 text-xs text-muted-foreground">
          No suggestions — free-text only. Value: <code>{value || "(empty)"}</code>
        </p>
      </div>
    );
  },
  args: {
    suggestions: [],
    placeholder: "Type a parameter name...",
  },
};

export const Disabled: Story = {
  args: {
    suggestions: parameterNames,
    value: "region",
    disabled: true,
    onChange: () => {},
  },
};
