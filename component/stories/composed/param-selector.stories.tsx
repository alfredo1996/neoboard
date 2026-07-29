import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { ParamSelector } from "@/components/composed/parameter-widgets/param-selector";

const cities = [
  { value: "IT-ROM", label: "Rome" },
  { value: "IT-MIL", label: "Milan" },
  { value: "IT-NAP", label: "Naples" },
  { value: "IT-TRN", label: "Turin" },
];

const meta = {
  title: "Composed/ParamSelector",
  component: ParamSelector,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Single-select parameter widget. `searchable` swaps the Radix select for a Command popover with a search input. Setting `parentParameterName` makes it **cascading**: the control is disabled and prompts for the parent until `parentValue` arrives (#1360 — this replaced the separate `CascadingSelector`, which had no way to type into it).",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    searchable: { control: "boolean" },
    loading: { control: "boolean" },
    parentValue: { control: "text" },
    parentParameterName: { control: "text" },
  },
} satisfies Meta<typeof ParamSelector>;

export default meta;
type Story = StoryObj<typeof meta>;

function Controlled(args: React.ComponentProps<typeof ParamSelector>) {
  const [value, setValue] = useState(args.value ?? "");
  return (
    <div className="w-[280px]">
      <ParamSelector {...args} value={value} onChange={setValue} />
    </div>
  );
}

export const Default: Story = {
  render: (args) => <Controlled {...args} />,
  args: {
    parameterName: "city",
    options: cities,
    value: "",
    onChange: () => {},
  },
};

export const Searchable: Story = {
  render: (args) => <Controlled {...args} />,
  args: {
    parameterName: "city",
    options: cities,
    value: "",
    onChange: () => {},
    searchable: true,
  },
};

/** Cascading, parent not yet chosen: disabled, prompting for the parent. */
export const CascadingWaitingForParent: Story = {
  render: (args) => <Controlled {...args} />,
  args: {
    parameterName: "city",
    options: [],
    value: "",
    onChange: () => {},
    searchable: true,
    parentParameterName: "country",
  },
};

/** Cascading, parent chosen: enabled, options loaded, search available. */
export const CascadingParentSet: Story = {
  render: (args) => <Controlled {...args} />,
  args: {
    parameterName: "city",
    options: cities,
    value: "IT-MIL",
    onChange: () => {},
    searchable: true,
    parentParameterName: "country",
    parentValue: "IT",
  },
};

/** The non-searchable variant is gated the same way. */
export const CascadingWaitingForParentPlain: Story = {
  render: (args) => <Controlled {...args} />,
  args: {
    parameterName: "city",
    options: [],
    value: "",
    onChange: () => {},
    parentParameterName: "country",
  },
};

export const Loading: Story = {
  render: (args) => <Controlled {...args} />,
  args: {
    parameterName: "city",
    options: [],
    value: "",
    onChange: () => {},
    loading: true,
  },
};
