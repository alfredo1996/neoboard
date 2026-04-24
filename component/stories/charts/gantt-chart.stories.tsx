import type { Meta, StoryObj } from "@storybook/react";
import { GanttChart } from "@/charts/gantt-chart";

const meta = {
  title: "Charts/GanttChart",
  component: GanttChart,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ width: "100%", height: 400 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GanttChart>;

export default meta;
type Story = StoryObj<typeof meta>;

// Helper: days from a base date
const day = (offset: number) => new Date(2026, 3, 1 + offset).getTime();

const projectData = [
  { task: "Requirements", start: day(0), end: day(5), category: "Planning" },
  { task: "Design", start: day(3), end: day(10), category: "Planning" },
  { task: "Frontend", start: day(8), end: day(22), category: "Development" },
  { task: "Backend", start: day(10), end: day(25), category: "Development" },
  { task: "Database", start: day(9), end: day(18), category: "Development" },
  { task: "Integration", start: day(20), end: day(28), category: "Testing" },
  { task: "QA", start: day(25), end: day(32), category: "Testing" },
  { task: "Deployment", start: day(30), end: day(33), category: "Release" },
  { task: "Documentation", start: day(28), end: day(34), category: "Release" },
];

export const Default: Story = {
  args: {
    data: projectData,
  },
};

export const WithCategories: Story = {
  args: {
    data: projectData,
    stylingRules: [
      {
        id: "r1",
        column: "category",
        operator: "==" as const,
        value: "Planning",
        color: "#5470c6",
      },
      {
        id: "r2",
        column: "category",
        operator: "==" as const,
        value: "Development",
        color: "#91cc75",
      },
      {
        id: "r3",
        column: "category",
        operator: "==" as const,
        value: "Testing",
        color: "#fac858",
      },
      {
        id: "r4",
        column: "category",
        operator: "==" as const,
        value: "Release",
        color: "#ee6666",
      },
    ],
  },
};

export const WithProgress: Story = {
  args: {
    data: [
      {
        task: "Requirements",
        start: day(0),
        end: day(5),
        category: "Done",
        progress: 1.0,
      },
      {
        task: "Design",
        start: day(3),
        end: day(10),
        category: "Done",
        progress: 1.0,
      },
      {
        task: "Frontend",
        start: day(8),
        end: day(22),
        category: "In Progress",
        progress: 0.65,
      },
      {
        task: "Backend",
        start: day(10),
        end: day(25),
        category: "In Progress",
        progress: 0.4,
      },
      {
        task: "Database",
        start: day(9),
        end: day(18),
        category: "Done",
        progress: 1.0,
      },
      {
        task: "Integration",
        start: day(20),
        end: day(28),
        category: "Not Started",
        progress: 0,
      },
      {
        task: "QA",
        start: day(25),
        end: day(32),
        category: "Not Started",
        progress: 0,
      },
      {
        task: "Deployment",
        start: day(30),
        end: day(33),
        category: "Not Started",
        progress: 0,
      },
    ],
    showProgress: true,
    stylingRules: [
      {
        id: "r1",
        column: "category",
        operator: "==" as const,
        value: "Done",
        color: "#91cc75",
      },
      {
        id: "r2",
        column: "category",
        operator: "==" as const,
        value: "In Progress",
        color: "#5470c6",
      },
      {
        id: "r3",
        column: "category",
        operator: "==" as const,
        value: "Not Started",
        color: "#aaa",
      },
    ],
  },
};

export const LargeDataset: Story = {
  args: {
    data: Array.from({ length: 30 }, (_, i) => ({
      task: `Task ${i + 1}`,
      start: day(i * 2),
      end: day(i * 2 + Math.floor(Math.random() * 8) + 3),
      category: ["Backend", "Frontend", "DevOps", "QA"][i % 4],
    })),
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100%", height: 600 }}>
        <Story />
      </div>
    ),
  ],
};

export const NoTodayLine: Story = {
  args: {
    data: projectData,
    showTodayLine: false,
  },
};

export const EmptyState: Story = {
  args: {
    data: [],
  },
};
