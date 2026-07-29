import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { ParamMultiSelector } from "@/components/composed/parameter-widgets/param-multi-selector";

const cities = [
  { value: "IT-ROM", label: "Rome" },
  { value: "IT-MIL", label: "Milan" },
  { value: "IT-NAP", label: "Naples" },
  { value: "IT-TRN", label: "Turin" },
];

const meta = {
  title: "Composed/ParamMultiSelector",
  component: ParamMultiSelector,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Multi-select parameter widget. Setting `parentParameterName` makes it **cascading**, exactly as on `ParamSelector`: the control is disabled and prompts for the parent until `parentValue` arrives. Since #1360 the widget editor offers 'Depends On' alongside 'Allow multiple selections', so a cascading multi-select is a configuration users can actually reach.",
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
} satisfies Meta<typeof ParamMultiSelector>;

export default meta;
type Story = StoryObj<typeof meta>;

function Controlled(args: React.ComponentProps<typeof ParamMultiSelector>) {
  const [values, setValues] = useState<string[]>(args.values ?? []);
  return (
    <div className="w-[280px]">
      <ParamMultiSelector {...args} values={values} onChange={setValues} />
    </div>
  );
}

export const Default: Story = {
  render: (args) => <Controlled {...args} />,
  args: {
    parameterName: "cities",
    options: cities,
    values: [],
    onChange: () => {},
  },
};

export const WithSelection: Story = {
  render: (args) => <Controlled {...args} />,
  args: {
    parameterName: "cities",
    options: cities,
    values: ["IT-ROM", "IT-MIL"],
    onChange: () => {},
  },
};

/** Cascading, parent not yet chosen: disabled, prompting for the parent. */
export const CascadingWaitingForParent: Story = {
  render: (args) => <Controlled {...args} />,
  args: {
    parameterName: "cities",
    options: [],
    values: [],
    onChange: () => {},
    searchable: true,
    parentParameterName: "country",
  },
};

/** Cascading, parent chosen: enabled, options loaded, search available. */
export const CascadingParentSet: Story = {
  render: (args) => <Controlled {...args} />,
  args: {
    parameterName: "cities",
    options: cities,
    values: ["IT-MIL"],
    onChange: () => {},
    searchable: true,
    parentParameterName: "country",
    parentValue: "IT",
  },
};
