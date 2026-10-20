import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { SegmentedControl } from "@/components/ui/segmented-control";

const options = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "last_30_days", label: "Last 30 days" },
];

const meta = {
  title: "UI/SegmentedControl",
  component: SegmentedControl,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  args: {
    "aria-label": "Date preset",
    options,
    value: "last_7_days",
    onValueChange: () => {},
  },
} satisfies Meta<typeof SegmentedControl>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

function InteractiveDemo(props: React.ComponentProps<typeof SegmentedControl>) {
  const [value, setValue] = React.useState(props.value);
  return <SegmentedControl {...props} value={value} onValueChange={setValue} />;
}

export const Interactive: Story = {
  render: (args) => <InteractiveDemo {...args} />,
};

export const NothingSelected: Story = {
  args: { value: "" },
};
