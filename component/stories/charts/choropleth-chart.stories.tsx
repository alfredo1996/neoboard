import type { Meta, StoryObj } from "@storybook/react";
import { expect, waitFor, within } from "storybook/test";
import { ChoroplethChart } from "@/charts/choropleth-chart";

const meta = {
  title: "Charts/ChoroplethChart",
  component: ChoroplethChart,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ width: "100%", height: 500 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ChoroplethChart>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * This chart renders to a `<canvas>`, so nothing about the map itself is
 * queryable as DOM — the aria-label counts regions and is byte-identical for
 * a correct ramp, an inverted one and a flat one.
 *
 * Reading the canvas back is the only way to assert the colours actually
 * painted. This is not a screenshot baseline (this vitest build has no
 * `toMatchScreenshot`): it asks one question the ramp bug (#1404/#1655) gets
 * wrong — "is every stop of the configured ramp on screen?" — and is immune
 * to layout, fonts and antialiasing, since it only looks for exact fills.
 */
function paintedColors(canvasElement: HTMLElement) {
  const canvas = canvasElement.querySelector("canvas");
  if (!canvas) return new Set<string>();
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return new Set<string>();
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const seen = new Set<string>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    seen.add(
      "#" +
        [data[i], data[i + 1], data[i + 2]]
          .map((v) => v.toString(16).padStart(2, "0"))
          .join(""),
    );
  }
  return seen;
}

/**
 * The five expected stops are written out rather than computed with
 * `buildSequentialRamp`, on purpose: calling the same function the chart calls
 * would make the assertion agree with any ramp the component happens to build,
 * including a broken one. These literals are an independent oracle — evenly
 * spaced sRGB interpolation between the two endpoints.
 */
const DEFAULT_RAMP = [
  "#fff7d6",
  "#e6c6a2",
  "#cc966d",
  "#b36539",
  "#993404",
] as const;
/** DEFAULT_RAMP's ends with CIE L* inverted (Python oracle), then interpolated. */
const DARK_DEFAULT_RAMP = [
  "#0b0b08",
  "#372c29",
  "#634e49",
  "#8e6f6a",
  "#ba908a",
] as const;
const GREEN_RAMP = [
  "#f7fcf5",
  "#b9cebf",
  "#7ca088",
  "#3e7252",
  "#00441b",
] as const;

async function expectRampPainted(
  canvasElement: HTMLElement,
  ramp: readonly string[],
) {
  await waitFor(
    () => {
      const painted = paintedColors(canvasElement);
      expect(ramp.filter((c) => painted.has(c))).toEqual([...ramp]);
    },
    { timeout: 5000 },
  );
}

/** Any CSS colour, resolved by the browser to sRGBA bytes. */
function cssColorBytes(color: string): number[] {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  return [...ctx.getImageData(0, 0, 1, 1).data];
}

/** WCAG relative luminance of sRGB bytes. */
function luminance([r, g, b]: number[]): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * The canvas is transparent, so a region is read against the nearest opaque
 * background behind it — the page's `bg-background` in either theme.
 */
function backdropLuminance(canvasElement: HTMLElement): number {
  for (let el: Element | null = canvasElement; el; el = el.parentElement) {
    const bytes = cssColorBytes(getComputedStyle(el).backgroundColor);
    if (bytes[3] === 255) return luminance(bytes);
  }
  return luminance([255, 255, 255]);
}

/**
 * With the legend hidden, every ramp colour on the canvas is a region. Each
 * stop must be painted, and its contrast against the backdrop must rise with
 * value — the "higher reads as more prominent" rule, in whichever theme.
 */
async function expectProminenceRises(
  canvasElement: HTMLElement,
  ramp: readonly string[],
) {
  await expectRampPainted(canvasElement, ramp);
  const bg = backdropLuminance(canvasElement);
  const contrast = ramp.map((c) => {
    const l = luminance(cssColorBytes(c));
    return (Math.max(l, bg) + 0.05) / (Math.min(l, bg) + 0.05);
  });
  for (let i = 1; i < contrast.length; i++) {
    expect(contrast[i], `stop ${i} vs stop ${i - 1}`).toBeGreaterThan(
      contrast[i - 1],
    );
  }
}

/** A chart that threw inside `setOption` shows this instead of rendering. */
function expectNoRenderError(canvasElement: HTMLElement) {
  expect(within(canvasElement).queryByRole("alert")).toBeNull();
}

// Population data (millions) — names match world.geo.json
const populationData = [
  { name: "China", value: 1425 },
  { name: "India", value: 1408 },
  { name: "United States", value: 333 },
  { name: "Indonesia", value: 275 },
  { name: "Pakistan", value: 229 },
  { name: "Nigeria", value: 218 },
  { name: "Brazil", value: 215 },
  { name: "Bangladesh", value: 171 },
  { name: "Russia", value: 144 },
  { name: "Mexico", value: 130 },
  { name: "Japan", value: 125 },
  { name: "Germany", value: 83 },
  { name: "United Kingdom", value: 67 },
  { name: "France", value: 65 },
  { name: "Italy", value: 59 },
  { name: "Canada", value: 38 },
  { name: "Australia", value: 26 },
  { name: "Spain", value: 47 },
  { name: "South Korea", value: 52 },
  { name: "Turkey", value: 85 },
  { name: "Thailand", value: 72 },
  { name: "South Africa", value: 60 },
  { name: "Egypt", value: 104 },
  { name: "Colombia", value: 51 },
  { name: "Argentina", value: 46 },
  { name: "Kenya", value: 54 },
  { name: "Saudi Arabia", value: 36 },
  { name: "Poland", value: 38 },
  { name: "Ukraine", value: 44 },
  { name: "Peru", value: 33 },
  { name: "Vietnam", value: 98 },
  { name: "Philippines", value: 113 },
  { name: "Iran", value: 87 },
  { name: "Ethiopia", value: 120 },
  { name: "Dem. Rep. Congo", value: 99 },
  { name: "Myanmar", value: 54 },
  { name: "Tanzania", value: 63 },
  { name: "Algeria", value: 44 },
  { name: "Morocco", value: 37 },
  { name: "Sudan", value: 45 },
  { name: "Iraq", value: 42 },
  { name: "Afghanistan", value: 40 },
  { name: "Malaysia", value: 33 },
  { name: "Nepal", value: 30 },
  { name: "Ghana", value: 32 },
  { name: "Angola", value: 34 },
  { name: "Mozambique", value: 32 },
  { name: "Madagascar", value: 28 },
  { name: "Venezuela", value: 28 },
  { name: "Cameroon", value: 27 },
];

export const WorldPopulation: Story = {
  args: {
    data: populationData,
  },
  play: async ({ canvasElement, args }) => {
    const chart = await within(canvasElement).findByRole("img");
    expect(chart).toHaveAttribute(
      "aria-label",
      `Choropleth map with ${args.data.length} regions`,
    );
    await expectRampPainted(canvasElement, DEFAULT_RAMP);
    expectNoRenderError(canvasElement);
  },
};

/**
 * One large country per band (splitNumber 5 over 10–90), so with the legend
 * hidden every ramp stop is painted by a region — skewed population data
 * leaves the middle bands empty.
 */
const oneRegionPerBand = [
  { name: "Brazil", value: 10 },
  { name: "Canada", value: 30 },
  { name: "Australia", value: 50 },
  { name: "Russia", value: 70 },
  { name: "China", value: 90 },
];

/**
 * #1402 — on the dark canvas the light end is the prominent one, so the
 * light-to-dark ramp painted as-is ranked regions backwards. Dark mode paints
 * the lightness-inverted ramp: lowest values dark, highest bright.
 */
export const DarkMode: Story = {
  // Legend off, so a matched ramp colour can only be a region, not a swatch.
  args: { data: oneRegionPerBand, showVisualMap: false },
  globals: { theme: "dark" },
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole("img");
    await expectProminenceRises(canvasElement, DARK_DEFAULT_RAMP);
    expectNoRenderError(canvasElement);
  },
};

/**
 * #1402 — "Show Legend" off used to drop the visualMap entirely, painting
 * every region the no-data fill. With the legend hidden no swatch paints a
 * ramp colour, so a ramp colour on the canvas can only be a region.
 */
export const LegendHidden: Story = {
  args: { data: oneRegionPerBand, showVisualMap: false },
  globals: { theme: "light" },
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole("img");
    await expectProminenceRises(canvasElement, DEFAULT_RAMP);
    expectNoRenderError(canvasElement);
  },
};

const gdpData = [
  { name: "United States", value: 25500 },
  { name: "China", value: 17960 },
  { name: "Japan", value: 4230 },
  { name: "Germany", value: 4070 },
  { name: "India", value: 3390 },
  { name: "United Kingdom", value: 3070 },
  { name: "France", value: 2780 },
  { name: "Italy", value: 2010 },
  { name: "Brazil", value: 1920 },
  { name: "Canada", value: 2140 },
  { name: "Russia", value: 2240 },
  { name: "South Korea", value: 1670 },
  { name: "Australia", value: 1680 },
  { name: "Spain", value: 1400 },
  { name: "Mexico", value: 1320 },
  { name: "Indonesia", value: 1290 },
  { name: "Turkey", value: 905 },
  { name: "Saudi Arabia", value: 1060 },
  { name: "Netherlands", value: 990 },
  { name: "Switzerland", value: 870 },
  { name: "Poland", value: 688 },
  { name: "Argentina", value: 632 },
  { name: "Sweden", value: 585 },
  { name: "Norway", value: 580 },
  { name: "Nigeria", value: 472 },
  { name: "Thailand", value: 536 },
];

export const GDPByCountry: Story = {
  args: {
    data: gdpData,
    minColor: "#fff7bc",
    maxColor: "#d95f0e",
  },
};

export const WithLabels: Story = {
  args: {
    data: populationData.slice(0, 15),
    showLabels: true,
  },
};

export const CustomColors: Story = {
  args: {
    data: populationData,
    minColor: "#f7fcf5",
    maxColor: "#00441b",
  },
  // #1404 — three of the five stops used to be hardcoded warm literals, so a
  // custom green ramp still painted orange in the middle. Requiring every
  // interpolated stop of *these* endpoints is what catches that.
  play: async ({ canvasElement, args }) => {
    expect([args.minColor, args.maxColor]).toEqual([
      GREEN_RAMP[0],
      GREEN_RAMP[GREEN_RAMP.length - 1],
    ]);
    await expectRampPainted(canvasElement, GREEN_RAMP);
    expectNoRenderError(canvasElement);
  },
};

/**
 * #1655 — `null` means "no measurement for this region", not zero. It must
 * reach ECharts as its own no-data marker without throwing, and must not drag
 * the ramp's low end down to zero.
 */
export const MissingValues: Story = {
  args: {
    data: [
      { name: "China", value: 1425 },
      { name: "India", value: null },
      { name: "Brazil", value: 215 },
      { name: "Nigeria", value: null },
      { name: "Canada", value: 38 },
    ],
  },
  play: async ({ canvasElement, args }) => {
    const chart = await within(canvasElement).findByRole("img");
    expect(chart).toHaveAttribute(
      "aria-label",
      `Choropleth map with ${args.data.length} regions`,
    );
    // Both ends of the ramp are painted, so the map drew measured regions
    // rather than falling through to the no-data fill for everything. Which
    // *band* a null pushes the others into is a canvas-only distinction — see
    // the option-object test for the domain itself.
    await waitFor(
      () => {
        const painted = paintedColors(canvasElement);
        expect(painted.has(DEFAULT_RAMP[0])).toBe(true);
        expect(painted.has(DEFAULT_RAMP[4])).toBe(true);
      },
      { timeout: 5000 },
    );
    expectNoRenderError(canvasElement);
  },
};

export const EmptyState: Story = {
  args: {
    data: [],
  },
  play: async ({ canvasElement }) => {
    const chart = await within(canvasElement).findByRole("img");
    expect(chart).toHaveAttribute(
      "aria-label",
      "Choropleth map with 0 regions",
    );
    expectNoRenderError(canvasElement);
    // Note: unlike BarChart, this chart has no DOM empty state — it mounts a
    // live canvas that happens to be blank, so there is nothing else to assert
    // and nothing for a screen reader beyond the label.
  },
};
