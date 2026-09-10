import type { Meta, StoryObj } from "@storybook/react";
import { expect, within, waitFor } from "storybook/test";
import * as echarts from "echarts/core";
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

/** Row encoding built by gantt-chart.tsx: [index, start, end, duration, category, progress]. */
type GanttRow = { value: [number, number, number, number, string, number] };
type GanttOption = {
  series: { data?: GanttRow[]; markLine?: unknown }[];
  yAxis?: { data?: string[] }[];
  xAxis?: { splitLine?: { show?: boolean } }[];
  title?: { text?: string }[];
  grid?: { bottom?: number }[];
  dataZoom?: {
    type: string;
    xAxisIndex?: number | number[];
    filterMode?: string;
    labelFormatter?: (ms: number) => string;
  }[];
};

/**
 * The option ECharts actually applied. The bars themselves are canvas pixels,
 * but the row array, the task axis and the today line are all readable back off
 * the live instance — so "did it draw the data" is assertable without a
 * baseline image.
 */
async function ganttOption(canvasElement: HTMLElement): Promise<GanttOption> {
  const el = await within(canvasElement).findByTestId("base-chart");
  return waitFor(() => {
    const option = echarts.getInstanceByDom(el)?.getOption();
    if (!option) throw new Error("ECharts instance not initialised yet");
    return option as unknown as GanttOption;
  });
}

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
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("img")).toHaveAccessibleName(
      "Gantt chart with 9 tasks",
    );

    const option = await ganttOption(canvasElement);

    // Every task reached the axis, in order — a dropped or reordered row shows
    // up here and nowhere else in the DOM.
    expect(option.yAxis?.[0]?.data).toEqual(projectData.map((t) => t.task));

    // ...and the bars carry the real dates, not just the right count.
    expect(option.series[0]?.data?.map((r) => r.value.slice(1, 3))).toEqual(
      projectData.map((t) => [t.start, t.end]),
    );

    // #1289: the time grid must actually be switched on.
    expect(option.xAxis?.[0]?.splitLine?.show).toBe(true);
    // Default showTodayLine — the reference line exists.
    expect(option.series[0]?.markLine).toBeDefined();
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
  play: async ({ canvasElement }) => {
    const option = await ganttOption(canvasElement);
    const colorFor: Record<string, string> = {
      Planning: "#5470c6",
      Development: "#91cc75",
      Testing: "#fac858",
      Release: "#ee6666",
    };
    // Each bar took the colour its own category rule names. A rule matched
    // against the wrong column, or dropped entirely, changes this array.
    expect(
      option.series[0]?.data?.map(
        (r) =>
          (r as unknown as { itemStyle?: { color?: string } }).itemStyle?.color,
      ),
    ).toEqual(projectData.map((t) => colorFor[t.category]));
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
  play: async ({ canvasElement, args }) => {
    const option = await ganttOption(canvasElement);
    // The progress overlay is drawn from value[5]. Its width is canvas-only,
    // but whether the number survived the row build is not.
    expect(option.series[0]?.data?.map((r) => r.value[5])).toEqual(
      args.data.map((t) => t.progress),
    );
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
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("img")).toHaveAccessibleName(
      "Gantt chart with 30 tasks",
    );
    const option = await ganttOption(canvasElement);
    // Nothing is silently dropped at 30 rows — the axis labels truncate, the
    // row set does not.
    expect(option.yAxis?.[0]?.data).toEqual(args.data.map((t) => t.task));
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100%", height: 600 }}>
        <Story />
      </div>
    ),
  ],
};

// Helper: hours into a ten-day sprint
const at = (dayOffset: number, hour: number) =>
  new Date(2026, 3, 13 + dayOffset, hour).getTime();

/**
 * Datetimes, not dates (#1686): shifts that start mid-morning and end late
 * afternoon across a working fortnight. The slider handles should read
 * `2026-04-13 09:00`, whatever tick interval the axis settles on, and the
 * slider should sit under the plot, not under the task labels.
 */
export const MultiDayDatetime: Story = {
  args: {
    data: [
      { task: "Kick-off", start: at(0, 9), end: at(0, 11), category: "Plan" },
      { task: "Discovery", start: at(0, 13), end: at(2, 17), category: "Plan" },
      { task: "API spike", start: at(1, 10), end: at(3, 15), category: "Build" },
      { task: "Schema", start: at(2, 9), end: at(4, 18), category: "Build" },
      { task: "UI", start: at(3, 14), end: at(7, 12), category: "Build" },
      { task: "Load test", start: at(6, 8), end: at(8, 20), category: "Verify" },
      { task: "Review", start: at(8, 10), end: at(9, 16), category: "Verify" },
      { task: "Release", start: at(9, 17), end: at(9, 18), category: "Ship" },
    ],
  },
  play: async ({ canvasElement, args }) => {
    const option = await ganttOption(canvasElement);
    const xZooms = (option.dataZoom ?? []).filter((z) =>
      Array.isArray(z.xAxisIndex)
        ? z.xAxisIndex.includes(0)
        : z.xAxisIndex === 0,
    );
    // Slider and wheel both filter weakly: a bar stays while either end is in
    // the window instead of vanishing at the edge as you zoom in.
    expect(xZooms.map((z) => z.filterMode)).toEqual([
      "weakFilter",
      "weakFilter",
    ]);
    // The handle label is the datetime, in a fixed shape.
    const slider = xZooms.find((z) => z.type === "slider");
    expect(slider?.labelFormatter?.(args.data[0].start)).toBe(
      "2026-04-13 09:00",
    );
  },
};

/** The other half of the toggle: no slider, and the plot takes its room back. */
export const WithoutTimeZoom: Story = {
  args: {
    data: projectData,
    enableDataZoom: false,
  },
  play: async ({ canvasElement }) => {
    const option = await ganttOption(canvasElement);
    expect(
      (option.dataZoom ?? []).filter((z) => z.xAxisIndex !== undefined),
    ).toEqual([]);
    expect(option.grid?.[0]?.bottom).toBe(16);
  },
};

export const NoTodayLine: Story = {
  args: {
    data: projectData,
    showTodayLine: false,
  },
  play: async ({ canvasElement }) => {
    const option = await ganttOption(canvasElement);
    // The negative half of Default's markLine assertion: together they prove
    // the flag still reaches the option rather than latching at mount, which is
    // the memo-dependency class this component has already been bitten by.
    expect(option.series[0]?.markLine).toBeUndefined();
  },
};

export const EmptyState: Story = {
  args: {
    data: [],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("img")).toHaveAccessibleName(
      "Gantt chart with 0 tasks",
    );
    const option = await ganttOption(canvasElement);
    // No rows drawn, and the "No data" placeholder in their place. GanttChart
    // has no DOM empty state, so this is the only place it is observable.
    expect(option.series).toHaveLength(0);
    expect(option.title?.[0]?.text).toBe("No data");
  },
};
