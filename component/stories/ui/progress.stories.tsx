import type { Meta, StoryObj } from "@storybook/react";
import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";

const meta = {
  title: "UI/Progress",
  component: Progress,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    value: {
      control: { type: "range", min: 0, max: 100 },
      description: "Determinate completion percentage; omit for indeterminate",
    },
  },
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Progress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Determinate: Story = { args: { value: 40 } };

export const Complete: Story = { args: { value: 100 } };

export const Indeterminate: Story = {};

function AnimatedDemo() {
  const [value, setValue] = useState(10);
  useEffect(() => {
    const t = setInterval(() => setValue((v) => (v >= 100 ? 10 : v + 10)), 800);
    return () => clearInterval(t);
  }, []);
  return <Progress value={value} />;
}

export const Animated: Story = { render: () => <AnimatedDemo /> };
