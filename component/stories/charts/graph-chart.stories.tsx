import type { Meta, StoryObj } from "@storybook/react";
import { GraphChart } from "@/charts/graph-chart";

const meta = {
  title: "Charts/GraphChart",
  component: GraphChart,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ width: "100%", height: 500 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GraphChart>;

export default meta;
type Story = StoryObj<typeof meta>;

const socialNodes = [
  { id: "alice", label: "Alice", value: 40 },
  { id: "bob", label: "Bob", value: 30 },
  { id: "charlie", label: "Charlie", value: 35 },
  { id: "diana", label: "Diana", value: 25 },
  { id: "eve", label: "Eve", value: 20 },
];

const socialEdges = [
  { source: "alice", target: "bob", label: "friends" },
  { source: "alice", target: "charlie", label: "colleagues" },
  { source: "bob", target: "diana", label: "friends" },
  { source: "charlie", target: "diana", label: "manages" },
  { source: "diana", target: "eve", label: "mentors" },
  { source: "eve", target: "alice", label: "reports_to" },
];

export const Default: Story = {
  args: {
    nodes: socialNodes,
    edges: socialEdges,
  },
};

export const CircularLayout: Story = {
  args: {
    nodes: socialNodes,
    edges: socialEdges,
    layout: "circular",
  },
};

export const WithCategories: Story = {
  args: {
    nodes: [
      { id: "alice", label: "Alice", value: 40, category: 0 },
      { id: "bob", label: "Bob", value: 30, category: 0 },
      { id: "acme", label: "Acme Corp", value: 50, category: 1 },
      { id: "globex", label: "Globex", value: 45, category: 1 },
      { id: "charlie", label: "Charlie", value: 35, category: 0 },
    ],
    edges: [
      { source: "alice", target: "acme", label: "works_at" },
      { source: "bob", target: "globex", label: "works_at" },
      { source: "charlie", target: "acme", label: "works_at" },
      { source: "alice", target: "bob", label: "knows" },
    ],
    categories: ["Person", "Company"],
  },
};

export const NoLabels: Story = {
  args: {
    nodes: socialNodes,
    edges: socialEdges,
    showLabels: false,
  },
};

export const EmptyState: Story = {
  args: {
    nodes: [],
    edges: [],
  },
};
