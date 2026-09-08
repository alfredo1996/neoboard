import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "storybook/test";
import { PieChart } from "@/charts/pie-chart";

const meta = {
  title: "Charts/PieChart",
  component: PieChart,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ width: "100%", height: 400 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PieChart>;

export default meta;
type Story = StoryObj<typeof meta>;

const segmentData = [
  { name: "Desktop", value: 1048 },
  { name: "Mobile", value: 735 },
  { name: "Tablet", value: 580 },
  { name: "Smart TV", value: 234 },
  { name: "Other", value: 154 },
];

export const Default: Story = {
  args: {
    data: segmentData,
  },
  // Slices, labels, legend and the donut hole are all canvas. What is left in
  // the DOM is the accessible name and the canvas itself — so this asserts the
  // chart mounted and describes its five segments, and nothing more than that.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("img", { name: "Pie chart with 5 segments" });
    await expect(canvasElement.querySelector("canvas")).toBeInTheDocument();
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
  },
};

export const Donut: Story = {
  args: {
    data: segmentData,
    donut: true,
  },
};

export const NoLabels: Story = {
  args: {
    data: segmentData,
    showLabel: false,
  },
};

export const NoLegend: Story = {
  args: {
    data: segmentData,
    showLegend: false,
  },
};

export const EmptyState: Story = {
  args: {
    data: [],
  },
  // Unlike bar-chart, an empty pie still mounts a live canvas with "No data"
  // drawn into it — there is no DOM empty state to assert, only the label.
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole("img", {
      name: "Pie chart with 0 segments",
    });
  },
};
