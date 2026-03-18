import type { Meta, StoryObj } from "@storybook/react";
import { SunburstChart } from "@/charts/sunburst-chart";

const meta = {
  title: "Charts/SunburstChart",
  component: SunburstChart,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ width: "100%", height: 400 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SunburstChart>;

export default meta;
type Story = StoryObj<typeof meta>;

const hierarchicalData = [
  {
    name: "Technology",
    children: [
      {
        name: "Frontend",
        children: [
          { name: "React", value: 40 },
          { name: "Vue", value: 20 },
          { name: "Angular", value: 15 },
        ],
      },
      {
        name: "Backend",
        children: [
          { name: "Node.js", value: 35 },
          { name: "Python", value: 30 },
          { name: "Java", value: 25 },
        ],
      },
      {
        name: "Database",
        children: [
          { name: "PostgreSQL", value: 30 },
          { name: "Neo4j", value: 20 },
          { name: "Redis", value: 15 },
        ],
      },
    ],
  },
  {
    name: "Business",
    children: [
      {
        name: "Sales",
        children: [
          { name: "Direct", value: 50 },
          { name: "Channel", value: 30 },
        ],
      },
      {
        name: "Marketing",
        children: [
          { name: "Digital", value: 40 },
          { name: "Events", value: 20 },
        ],
      },
    ],
  },
];

const flatData = [
  {
    name: "Documents",
    children: [
      { name: "Reports", value: 120 },
      { name: "Presentations", value: 85 },
      { name: "Spreadsheets", value: 65 },
      { name: "Images", value: 200 },
      { name: "Videos", value: 350 },
      { name: "Audio", value: 90 },
    ],
  },
];

export const Default: Story = {
  args: {
    data: hierarchicalData,
  },
};

export const FlatWithParent: Story = {
  args: {
    data: flatData,
  },
};

export const CircleLayout: Story = {
  args: {
    data: hierarchicalData,
  },
};

export const AscendingSort: Story = {
  args: {
    data: hierarchicalData,
    sort: "asc",
  },
};

export const EmptyState: Story = {
  args: {
    data: [],
  },
};
