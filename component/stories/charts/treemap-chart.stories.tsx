import type { Meta, StoryObj } from "@storybook/react";
import { expect, within, waitFor } from "storybook/test";
import * as echarts from "echarts/core";
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

type Tile = {
  name?: string;
  value?: number;
  itemStyle?: { color?: string };
  children?: Tile[];
};
type TreemapOption = {
  series: { data?: Tile[] }[];
  title?: { text?: string }[];
};

/**
 * The option ECharts actually applied. Box geometry is canvas pixels, but the
 * tile tree and the per-tile fill — the two things #1405 was about — are read
 * back off the live instance, so they need no baseline image.
 */
async function treemapOption(
  canvasElement: HTMLElement,
): Promise<TreemapOption> {
  const el = await within(canvasElement).findByTestId("base-chart");
  return waitFor(() => {
    const option = echarts.getInstanceByDom(el)?.getOption();
    if (!option) throw new Error("ECharts instance not initialised yet");
    return option as unknown as TreemapOption;
  });
}

const tilesOf = (option: TreemapOption) => option.series[0]?.data ?? [];

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
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("img")).toHaveAccessibleName(
      "Treemap with 8 top-level items",
    );

    const tiles = tilesOf(await treemapOption(canvasElement));
    expect(tiles.map((t) => [t.name, t.value])).toEqual(
      flatData.map((d) => [d.name, d.value]),
    );
    // #1405: flat data is one hue. Every tile takes palette[0]; a tile picking
    // up a second colour means the palette is cycling again.
    const fills = new Set(tiles.map((t) => t.itemStyle?.color));
    expect(fills.size).toBe(1);
  },
};

export const Nested: Story = {
  args: {
    data: nestedData,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("img")).toHaveAccessibleName(
      "Treemap with 4 top-level items",
    );

    const tiles = tilesOf(await treemapOption(canvasElement));
    // The hierarchy survived the paint pass: same groups, same children.
    expect(tiles.map((t) => t.name)).toEqual(nestedData.map((g) => g.name));
    expect(tiles.map((t) => t.children?.map((c) => c.name))).toEqual(
      nestedData.map((g) => g.children.map((c) => c.name)),
    );

    // #1405: a group owns a hue, but only the first three — past that a hue
    // identifies nothing, so the rest share one quiet fill.
    const fills = tiles.map((t) => t.itemStyle?.color);
    expect(new Set(fills.slice(0, 3)).size).toBe(3);
    expect(fills[3]).not.toBe(fills[0]);
  },
};

export const WithValues: Story = {
  args: {
    data: flatData,
    showValues: true,
  },
};

export const EmptyState: Story = {
  args: {
    data: [],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("img")).toHaveAccessibleName(
      "Treemap with 0 top-level items",
    );
    const option = await treemapOption(canvasElement);
    // TreemapChart keeps a live canvas when empty, so "nothing was drawn" is
    // only observable here.
    expect(option.series).toHaveLength(0);
    expect(option.title?.[0]?.text).toBe("No data");
  },
};

/** Flat data is one hue: area carries the value, colour would encode nothing. */
export const ManyFlatItems: Story = {
  args: {
    data: Array.from({ length: 24 }, (_, i) => ({
      name: `Item ${i + 1}`,
      value: 120 - i * 4,
    })),
  },
  play: async ({ canvasElement, args }) => {
    const tiles = tilesOf(await treemapOption(canvasElement));
    expect(tiles).toHaveLength(args.data.length);
    // The literal #1405 regression: 24 flat tiles used to cycle the palette
    // three times because ECharts loops a short `color` array.
    expect(new Set(tiles.map((t) => t.itemStyle?.color)).size).toBe(1);
  },
};

/** Groups past the third share a quiet fill; their label identifies them. */
export const ManyGroups: Story = {
  args: {
    data: Array.from({ length: 6 }, (_, g) => ({
      name: `Group ${g + 1}`,
      children: Array.from({ length: 4 }, (_, i) => ({
        name: `G${g + 1}-${i + 1}`,
        value: 40 - i * 6,
      })),
    })),
  },
  play: async ({ canvasElement }) => {
    const fills = tilesOf(await treemapOption(canvasElement)).map(
      (t) => t.itemStyle?.color,
    );
    expect(fills).toHaveLength(6);
    // Three named hues, then one shared muted fill for the tail — the boundary
    // the story exists to show.
    expect(new Set(fills.slice(0, 3)).size).toBe(3);
    expect(new Set(fills.slice(3)).size).toBe(1);
    expect(fills.slice(0, 3)).not.toContain(fills[3]);
  },
};
