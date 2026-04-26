import type { Meta, StoryObj } from "@storybook/react";
import { CirclePackingChart } from "@/charts/circle-packing-chart";

const meta = {
  title: "Charts/CirclePackingChart",
  component: CirclePackingChart,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ width: "100%", height: 500 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CirclePackingChart>;

export default meta;
type Story = StoryObj<typeof meta>;

const techData = [
  {
    name: "Technology",
    children: [
      {
        name: "Frontend",
        children: [
          { name: "React", value: 40 },
          { name: "Vue", value: 20 },
          { name: "Angular", value: 15 },
          { name: "Svelte", value: 10 },
        ],
      },
      {
        name: "Backend",
        children: [
          { name: "Node.js", value: 35 },
          { name: "Python", value: 30 },
          { name: "Java", value: 25 },
          { name: "Go", value: 18 },
        ],
      },
      {
        name: "Database",
        children: [
          { name: "PostgreSQL", value: 30 },
          { name: "Neo4j", value: 20 },
          { name: "Redis", value: 15 },
          { name: "MongoDB", value: 22 },
        ],
      },
      {
        name: "DevOps",
        children: [
          { name: "Docker", value: 28 },
          { name: "K8s", value: 22 },
          { name: "Terraform", value: 14 },
        ],
      },
    ],
  },
];

export const Default: Story = {
  args: { data: techData },
};

export const FlatData: Story = {
  args: {
    data: [
      { name: "Alpha", value: 100 },
      { name: "Beta", value: 80 },
      { name: "Gamma", value: 60 },
      { name: "Delta", value: 40 },
      { name: "Epsilon", value: 20 },
    ],
  },
};

export const NoLabels: Story = {
  args: { data: techData, showLabels: false },
};

export const EmptyState: Story = {
  args: { data: [] },
};
