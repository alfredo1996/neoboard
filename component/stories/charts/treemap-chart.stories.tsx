import type { Meta, StoryObj } from "@storybook/react";
import { TreemapChart } from "@/charts/treemap-chart";

const meta = {
  title: "Charts/TreemapChart",
  component: TreemapChart,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ width: "100%", height: 400 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TreemapChart>;

export default meta;
type Story = StoryObj<typeof meta>;

const flatData = [
  { name: "React", value: 4200 },
  { name: "Next.js", value: 3100 },
  { name: "Vue", value: 2800 },
  { name: "Angular", value: 2400 },
  { name: "Svelte", value: 1900 },
  { name: "SolidJS", value: 1100 },
  { name: "Remix", value: 900 },
  { name: "Astro", value: 800 },
];

const nestedData = [
  {
    name: "Frontend",
    children: [
      { name: "React", value: 4200 },
      { name: "Vue", value: 2800 },
      { name: "Angular", value: 2400 },
      { name: "Svelte", value: 1900 },
    ],
  },
  {
    name: "Backend",
    children: [
      { name: "Node.js", value: 3500 },
      { name: "Python", value: 3200 },
      { name: "Go", value: 2100 },
      { name: "Rust", value: 1400 },
    ],
  },
  {
    name: "Database",
    children: [
      { name: "PostgreSQL", value: 3000 },
      { name: "MySQL", value: 2600 },
      { name: "Neo4j", value: 1800 },
      { name: "MongoDB", value: 2200 },
    ],
  },
  {
    name: "DevOps",
    children: [
      { name: "Docker", value: 2800 },
      { name: "Kubernetes", value: 2400 },
      { name: "Terraform", value: 1600 },
    ],
  },
];

export const Default: Story = {
  args: {
    data: flatData,
  },
};

export const Nested: Story = {
  args: {
    data: nestedData,
  },
};

export const WithValues: Story = {
  args: {
    data: flatData,
    showValues: true,
  },
};

export const HighSaturation: Story = {
  args: {
    data: nestedData,
    colorSaturation: "high",
  },
};

export const EmptyState: Story = {
  args: {
    data: [],
  },
};
