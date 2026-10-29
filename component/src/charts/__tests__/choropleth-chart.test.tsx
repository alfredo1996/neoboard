import { aliasNeedingRegions } from "./fixtures/connector-output";
import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// echarts/charts, components, renderers are mocked globally in vitest.setup.ts.
// Mock echarts/core here to capture setOption + stub map registration.
const mockSetOption = vi.fn();
vi.mock("echarts/core", () => {
  const use = vi.fn();
  const init = vi.fn(() => ({
    setOption: mockSetOption,
    resize: vi.fn(),
    dispose: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    showLoading: vi.fn(),
    hideLoading: vi.fn(),
  }));
  const registerTheme = vi.fn();
  const registerMap = vi.fn();
  const getMap = vi.fn(() => ({})); // truthy -> skip registerMap path
  const format = {
    encodeHTML: (v: string) =>
      v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
  };
  return {
    use,
    init,
    registerTheme,
    registerMap,
    getMap,
    format,
    default: { use, init, registerTheme, registerMap, getMap, format },
  };
});

import { ChoroplethChart } from "../choropleth-chart";
import { getDefaultChartSettings } from "@/components/composed/chart-options";

const data = [
  { name: "United States", value: 100 },
  { name: "China", value: 80 },
];

function lastOptionWith(key: string) {
  const calls = mockSetOption.mock.calls.map((c) => c[0]);
  return [...calls].reverse().find((o) => o && o[key] !== undefined);
}

describe("ChoroplethChart", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the chart container", () => {
    render(<ChoroplethChart data={data} />);
    expect(screen.getByTestId("base-chart")).toBeInTheDocument();
  });

  it("scales the ramp from measured values and marks a null region no-data (#1655)", async () => {
    render(
      <ChoroplethChart
        data={[
          { name: "France", value: null },
          { name: "Spain", value: 120 },
          { name: "Italy", value: 180 },
        ]}
      />,
    );
    await waitFor(() => expect(lastOptionWith("visualMap")).toBeDefined(), {
      timeout: 10000,
    });
    // Math.min(null, 120, 180) is 0 — one unmeasured country used to anchor
    // the ramp at zero and push every real country up a band.
    expect(lastOptionWith("visualMap").visualMap.min).toBe(120);
    expect(lastOptionWith("visualMap").visualMap.max).toBe(180);
    // "-" is ECharts' own no-data marker and the only missing marker inside
    // MapSeriesOption's data union. Verified by rendering: a "-" region keeps
    // series.itemStyle.areaColor, byte-identical to a region absent from the
    // result, and params.value reaches the tooltip as NaN either way.
    const series = lastOptionWith("series").series[0];
    expect(series.data[0].value).toBe("-");
    expect(series.data[1].value).toBe(120);
  }, 15000);

  it("uses a warm sequential ramp (not the off-brand ColorBrewer blues)", async () => {
    render(<ChoroplethChart data={data} />);
    // visualMap options only build after the async world.geo.json import +
    // registration resolves — a large dynamic import that can exceed waitFor's
    // 1s default under parallel CI load, so give it headroom.
    await waitFor(() => expect(lastOptionWith("visualMap")).toBeDefined(), {
      timeout: 10000,
    });
    const opt = lastOptionWith("visualMap");
    const ramp = opt.visualMap.inRange.color as string[];
    expect(ramp[0]).toBe("#FBEBD0"); // pale citrine min default
    expect(ramp[ramp.length - 1]).toBe("#7A520C"); // deep citrine max default
    expect(ramp).not.toContain("#2171b5"); // no stock blue stop
  }, 15000);
});

// The approved mock's citrine sequential ramps (#2230), one per theme.
const LIGHT_RAMP = ["#FBEBD0", "#F3C980", "#E0A13A", "#B57A12", "#7A520C"];
const DARK_RAMP = ["#3A2A10", "#6B4A12", "#A06D15", "#D9922A", "#F5C46E"];

describe("ChoroplethChart legend and theme (#1402)", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => document.documentElement.classList.remove("dark"));

  // "Show Legend" off used to drop the whole visualMap, and with it the only
  // thing that maps values to colours — every region fell to the no-data fill.
  it("showVisualMap=false hides only the legend, keeping the colour encoding", async () => {
    render(<ChoroplethChart data={data} showVisualMap={false} />);
    await waitFor(
      () => {
        const { visualMap } = lastOptionWith("series");
        expect(visualMap).toBeDefined();
        expect(visualMap.show).toBe(false);
        expect(visualMap.min).toBe(80);
        expect(visualMap.max).toBe(100);
        expect(visualMap.inRange.color).toEqual([...LIGHT_RAMP]);
      },
      { timeout: 15_000 },
    );
  }, 20_000);

  it("shows the legend by default", async () => {
    render(<ChoroplethChart data={data} />);
    await waitFor(
      () => expect(lastOptionWith("series").visualMap.show).toBe(true),
      { timeout: 15_000 },
    );
  }, 20_000);

  // Light-to-dark on a dark canvas ranks regions backwards; dark mode inverts
  // the ends' perceptual lightness so the highest value is the most prominent.
  it("inverts the ramp's lightness in dark mode", async () => {
    document.documentElement.classList.add("dark");
    render(<ChoroplethChart data={data} />);
    await waitFor(
      () =>
        expect(lastOptionWith("series").visualMap.inRange.color).toEqual([
          ...DARK_RAMP,
        ]),
      { timeout: 15_000 },
    );
  }, 20_000);

  // #1583 was a chart frozen on its mount-time theme. Toggling the class after
  // mount must rebuild the ramp, both ways.
  it("rebuilds the ramp when the theme toggles after mount", async () => {
    render(<ChoroplethChart data={data} />);
    await waitFor(
      () =>
        expect(lastOptionWith("series").visualMap.inRange.color).toEqual([
          ...LIGHT_RAMP,
        ]),
      { timeout: 15_000 },
    );
    act(() => document.documentElement.classList.add("dark"));
    await waitFor(
      () =>
        expect(lastOptionWith("series").visualMap.inRange.color).toEqual([
          ...DARK_RAMP,
        ]),
      { timeout: 15_000 },
    );
    act(() => document.documentElement.classList.remove("dark"));
    await waitFor(
      () =>
        expect(lastOptionWith("series").visualMap.inRange.color).toEqual([
          ...LIGHT_RAMP,
        ]),
      { timeout: 15_000 },
    );
  }, 45_000);
});

describe("connector-shaped fixtures (#1636)", () => {
  it("maps the names real data uses onto the GeoJSON's (USA, Czech Republic)", async () => {
    // The alias map exists because the demo dataset says "USA" and the world
    // GeoJSON says "United States". Delete the map and every such region
    // silently vanishes from the flagship choropleth — this is the test that
    // fails when it does.
    render(<ChoroplethChart data={aliasNeedingRegions} />);
    // The series only builds after the async world.geo.json import resolves —
    // and with shuffled tests, a *previous* test's late setOption can land
    // during this one. So retry the assertion itself rather than accept the
    // first series that appears; it still times out red without the aliases.
    await waitFor(
      () => {
        const series = lastOptionWith("series").series[0];
        expect(series.data.map((d: { name: string }) => d.name)).toEqual([
          "United States of America",
          "Czechia",
        ]);
      },
      { timeout: 15_000 },
    );
  });
});

describe("Natural Earth, Equal Earth and unmatched rows (#2230)", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => document.documentElement.classList.remove("dark"));

  it("matches an ISO code, projects with Equal Earth and fills no-data with the muted colour", async () => {
    render(<ChoroplethChart data={[{ name: "FR", value: 4 }]} />);
    await waitFor(
      () => {
        const series = lastOptionWith("series").series[0];
        expect(series.data).toMatchObject([{ name: "France", value: 4 }]);
        expect(series.itemStyle.areaColor).toBe("#eeeff2");
        expect(series.projection.project([0, 0])).toEqual([0, -0]);
      },
      { timeout: 15_000 },
    );
  }, 20_000);

  it("says how many rows matched no country, and which, instead of dropping them silently", async () => {
    render(
      <ChoroplethChart
        data={[
          { name: "Italy", value: 1 },
          { name: "Narnia", value: 2 },
          { name: "Atlantis", value: 3 },
        ]}
      />,
    );
    const note = screen.getByRole("status");
    await waitFor(() => expect(note).toHaveTextContent("not matched"), {
      timeout: 15_000,
    });
    expect(note).toHaveTextContent("2 rows not matched to a country");
    expect(note).toHaveTextContent("Narnia");
    expect(note).toHaveTextContent("Atlantis");
  }, 20_000);

  it("shows no note when every row matched", async () => {
    render(<ChoroplethChart data={data} />);
    await waitFor(() => expect(lastOptionWith("series")).toBeDefined(), {
      timeout: 15_000,
    });
    // The live region stays mounted (empty) so a later note is announced.
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  }, 20_000);

  it("keeps the note out of the map, wrapped to two lines and focusable for the full list", async () => {
    render(<ChoroplethChart data={[{ name: "Narnia", value: 2 }]} />);
    const note = await screen.findByText(
      /not matched/,
      {},
      { timeout: 15_000 },
    );
    expect(note).toHaveClass("line-clamp-2");
    expect(note).not.toHaveClass("absolute");
    expect(note).toHaveAttribute("tabindex", "0");
    expect(note.contains(screen.getByTestId("base-chart"))).toBe(false);
  }, 20_000);

  it("mounts the live region before any row is unmatched", () => {
    render(<ChoroplethChart data={data} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("draws the legend as the mock does: continuous, horizontal, bottom left, two end values", async () => {
    render(<ChoroplethChart data={data} />);
    await waitFor(
      () => {
        const { visualMap } = lastOptionWith("series");
        expect(visualMap).toMatchObject({
          type: "continuous",
          orient: "horizontal",
          left: 8,
          bottom: 4,
          text: ["100", "80"],
        });
      },
      { timeout: 15_000 },
    );
  }, 20_000);
});

describe("editor defaults paint the citrine ramp (#2230)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("a widget created with getDefaultChartSettings gets the themed ramp", async () => {
    const { minColor, maxColor } = getDefaultChartSettings("choropleth") as {
      minColor: string;
      maxColor: string;
    };
    render(
      <ChoroplethChart data={data} minColor={minColor} maxColor={maxColor} />,
    );
    await waitFor(
      () =>
        expect(lastOptionWith("series").visualMap.inRange.color).toEqual([
          ...LIGHT_RAMP,
        ]),
      { timeout: 15_000 },
    );
  }, 20_000);
});

describe("Equal Earth keeps its shape in any box (#2230)", () => {
  beforeEach(() => vi.clearAllMocks());

  // Four insets without preserveAspect stretch the map to the widget: 1.64
  // on a 900x560 card against Equal Earth's true 2.05. Runs the chart's own
  // series option through real ECharts.
  it("projects at about 2.05:1 in a box that is not 2:1", async () => {
    render(<ChoroplethChart data={data} />);
    await waitFor(() => expect(lastOptionWith("series")).toBeDefined(), {
      timeout: 15_000,
    });
    const real = await vi.importActual<typeof import("echarts")>("echarts");
    const geo = (await import("../world.geo.json")).default;
    real.registerMap("world", geo as never);
    const chart = real.init(null, null, {
      renderer: "svg",
      ssr: true,
      width: 900,
      height: 560,
    });
    chart.setOption({ series: [lastOptionWith("series").series[0]] });
    const cs = (
      chart as unknown as {
        getModel(): {
          getSeriesByIndex(i: number): {
            coordinateSystem: { dataToPoint(p: number[]): number[] };
          };
        };
      }
    )
      .getModel()
      .getSeriesByIndex(0).coordinateSystem;
    const [west] = cs.dataToPoint([-180, 0]);
    const [east] = cs.dataToPoint([180, 0]);
    const [, north] = cs.dataToPoint([0, 90]);
    const [, south] = cs.dataToPoint([0, -90]);
    expect((east - west) / (south - north)).toBeCloseTo(2.054, 1);
    chart.dispose();
  }, 30_000);

  it.each([
    [
      [
        { name: "France", value: 0.12 },
        { name: "Spain", value: 0.87 },
      ],
      ["0.87", "0.12"],
    ],
    [
      [
        { name: "France", value: 1.4 },
        { name: "Spain", value: 1.6 },
      ],
      ["1.6", "1.4"],
    ],
    [
      [
        { name: "United States", value: 1200 },
        { name: "China", value: 80 },
      ],
      ["1,200", "80"],
    ],
  ])(
    "keeps the fractions in the legend end values of %j",
    async (rows, text) => {
      render(<ChoroplethChart data={rows} />);
      await waitFor(
        () => expect(lastOptionWith("series")?.visualMap?.text).toEqual(text),
        { timeout: 15_000 },
      );
    },
    20_000,
  );

  it("one row with a null or inherited-key name does not take the chart down", async () => {
    render(
      <ChoroplethChart
        data={
          [
            { name: null, value: 1 },
            { name: "constructor", value: 2 },
            { name: "China", value: 80 },
          ] as never
        }
      />,
    );
    await waitFor(
      () => expect(lastOptionWith("series")?.visualMap?.max).toBe(80),
      { timeout: 15_000 },
    );
  }, 20_000);

  it.each([
    ["<img src=x onerror=alert(1)>", "&lt;img src=x onerror=alert(1)&gt;"],
    ["France", "France"],
  ])(
    "escapes the name of a region with no value: %s (#2289)",
    async (name, out) => {
      render(
        <ChoroplethChart
          data={[
            { name, value: null },
            { name: "Spain", value: 5 },
          ]}
        />,
      );
      await waitFor(
        () =>
          expect(lastOptionWith("series")?.tooltip?.formatter).toBeTypeOf(
            "function",
          ),
        { timeout: 15_000 },
      );
      const { formatter } = lastOptionWith("series").tooltip;
      const html = formatter({ name, value: undefined });
      expect(html).not.toContain("<img");
      expect(html).toBe(out);
    },
    20_000,
  );
});

describe("label collisions (#2330)", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    { showLabels: true, layout: { hideOverlap: true } },
    { showLabels: false, layout: undefined },
  ])(
    "showLabels=$showLabels sets labelLayout to $layout",
    async ({ showLabels, layout }) => {
      render(
        <ChoroplethChart
          data={[{ name: "FR", value: 4 }]}
          showLabels={showLabels}
        />,
      );
      await waitFor(
        () => {
          expect(lastOptionWith("series").series[0].labelLayout).toEqual(
            layout,
          );
        },
        { timeout: 15_000 },
      );
    },
  );
});

describe("label contrast on the region's own fill (#2341)", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => document.documentElement.classList.remove("dark"));

  // Independent WCAG 2.x formula, deliberately not chart-utils' helper.
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const wcag = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  const names = ["United States", "China", "India", "France", "Germany"];
  const stopData = names.map((name, i) => ({ name, value: i * 25 }));
  const greens = { minColor: "#f7fcf5", maxColor: "#00441b" };

  it.each([
    { theme: "light", ramp: LIGHT_RAMP, props: {} },
    { theme: "dark", ramp: DARK_RAMP, props: {} },
    // #2315's greens: dark mode flips lightness, so the ramp is read from the option.
    { theme: "light", ramp: null, props: greens },
    { theme: "dark", ramp: null, props: greens },
  ])(
    "$theme $props: every stop's label clears 4.5:1",
    async ({ theme, ramp, props }) => {
      if (theme === "dark") document.documentElement.classList.add("dark");
      render(<ChoroplethChart data={stopData} showLabels {...props} />);
      await waitFor(
        () => expect(lastOptionWith("series")?.series[0].data).toHaveLength(5),
        { timeout: 15_000 },
      );
      const opt = lastOptionWith("series");
      const stops: string[] = ramp ?? opt.visualMap.inRange.color;
      const items = opt.series[0].data as { label: { color: string } }[];
      expect(items).toHaveLength(names.length);
      // matchRegions keeps row order, and the geo names differ from the rows'.
      items.forEach((item, i) => {
        expect(wcag(item.label.color, stops[i])).toBeGreaterThanOrEqual(4.5);
      });
    },
    20_000,
  );

  it("a measured region keeps its ramp colour on hover and its name carries a halo in that colour", async () => {
    render(<ChoroplethChart data={stopData} showLabels />);
    await waitFor(
      () => expect(lastOptionWith("series")?.series[0].data).toHaveLength(5),
      { timeout: 15_000 },
    );
    const items = lastOptionWith("series").series[0].data as {
      label: { textBorderColor: string; textBorderWidth: number };
      emphasis: {
        itemStyle: { areaColor: string };
        label: { textBorderColor: string; textBorderWidth: number };
      };
    }[];
    items.forEach((item, i) => {
      const fill = LIGHT_RAMP[i].toLowerCase();
      expect(item.emphasis.itemStyle.areaColor.toLowerCase()).toBe(fill);
      expect(item.label.textBorderColor.toLowerCase()).toBe(fill);
      expect(item.label.textBorderWidth).toBe(2);
      expect(item.emphasis.label.textBorderColor.toLowerCase()).toBe(fill);
      expect(item.emphasis.label.textBorderWidth).toBe(2);
    });
  }, 20_000);

  it("a single region sits mid-ramp and its label reaches 4.5:1 on it, dark", async () => {
    document.documentElement.classList.add("dark");
    render(
      <ChoroplethChart data={[{ name: "France", value: 7 }]} showLabels />,
    );
    await waitFor(
      () => expect(lastOptionWith("series")?.series[0].data).toHaveLength(1),
      { timeout: 15_000 },
    );
    const item = lastOptionWith("series").series[0].data[0];
    expect(wcag(item.label.color, DARK_RAMP[2])).toBeGreaterThanOrEqual(4.5);
    expect(item.emphasis.itemStyle.areaColor.toLowerCase()).toBe(
      DARK_RAMP[2].toLowerCase(),
    );
  }, 20_000);

  it("a NaN value is treated as no data and does not throw", async () => {
    render(
      <ChoroplethChart
        data={[
          { name: "France", value: 4 },
          { name: "Germany", value: Number.NaN },
        ]}
        showLabels
      />,
    );
    await waitFor(
      () => expect(lastOptionWith("series")?.series[0].data).toHaveLength(2),
      { timeout: 15_000 },
    );
    const data = lastOptionWith("series").series[0].data as {
      name: string;
      label: { show: boolean };
    }[];
    expect(data.find((d) => d.name === "Germany")?.label.show).toBe(false);
  }, 20_000);

  it("a region without data shows no name", async () => {
    render(
      <ChoroplethChart
        data={[
          { name: "France", value: 4 },
          { name: "Germany", value: null },
        ]}
        showLabels
      />,
    );
    await waitFor(
      () => expect(lastOptionWith("series")?.series[0].data).toHaveLength(2),
      { timeout: 15_000 },
    );
    const s = lastOptionWith("series").series[0];
    expect(s.label.show).toBe(false); // regions absent from the data
    const byName = (n: string) =>
      s.data.find((d: { name: string }) => d.name === n);
    expect(byName("France").label.show).toBe(true);
    expect(byName("Germany").label.show).toBe(false);
  }, 20_000);
});
