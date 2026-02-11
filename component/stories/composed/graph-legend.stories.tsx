import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { GraphLegend } from "@/components/composed/graph-legend";
import type { GraphLegendItem } from "@/components/composed/graph-legend";

const meta = {
  title: "Composed/GraphLegend",
  component: GraphLegend,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
} satisfies Meta<typeof GraphLegend>;

export default meta;
type Story = StoryObj<typeof meta>;

const items: GraphLegendItem[] = [
  { label: "Person", color: "#3b82f6", count: 42 },
  { label: "Movie", color: "#ef4444", count: 18 },
  { label: "Director", color: "#22c55e", count: 7 },
  { label: "Genre", color: "#f59e0b", count: 12 },
];

export const Default: Story = {
  args: { items },
};

export const Horizontal: Story = {
  args: {
    items,
    orientation: "horizontal",
  },
};

export const Interactive: Story = {
  render: function InteractiveLegend() {
    const [legendItems, setLegendItems] = React.useState(
      items.map((item) => ({ ...item, visible: true }))
    );
    return (
      <GraphLegend
        items={legendItems}
        onToggle={(label, visible) => {
          setLegendItems((prev) =>
            prev.map((item) =>
              item.label === label ? { ...item, visible } : item
            )
          );
        }}
      />
    );
  },
  args: { items },
};

export const WithHiddenItems: Story = {
  args: {
    items: [
      { label: "Person", color: "#3b82f6", count: 42, visible: true },
      { label: "Movie", color: "#ef4444", count: 18, visible: false },
      { label: "Director", color: "#22c55e", count: 7, visible: true },
      { label: "Genre", color: "#f59e0b", count: 12, visible: false },
    ],
  },
};

export const WithoutCounts: Story = {
  args: {
    items: [
      { label: "Person", color: "#3b82f6" },
      { label: "Movie", color: "#ef4444" },
      { label: "Director", color: "#22c55e" },
    ],
  },
};
