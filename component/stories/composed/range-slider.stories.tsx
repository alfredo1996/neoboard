import type { Meta, StoryObj } from "@storybook/react";
import { RangeSlider } from "@/components/composed/range-slider";

const meta = {
  title: "Composed/RangeSlider",
  component: RangeSlider,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof RangeSlider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    defaultValue: [25, 75],
  },
};

export const WithInputs: Story = {
  args: {
    defaultValue: [20, 80],
    showInput: true,
  },
};

export const WithMarks: Story = {
  args: {
    defaultValue: [0, 100],
    marks: [
      { value: 0, label: "0" },
      { value: 25, label: "25" },
      { value: 50, label: "50" },
      { value: 75, label: "75" },
      { value: 100, label: "100" },
    ],
  },
};

export const CustomRange: Story = {
  args: {
    min: 0,
    max: 1000,
    step: 50,
    defaultValue: [200, 800],
    showInput: true,
    marks: [
      { value: 0, label: "$0" },
      { value: 500, label: "$500" },
      { value: 1000, label: "$1000" },
    ],
  },
};

export const Disabled: Story = {
  args: {
    defaultValue: [30, 70],
    showInput: true,
    disabled: true,
  },
};
