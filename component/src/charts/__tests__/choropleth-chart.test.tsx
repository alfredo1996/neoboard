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
  return {
    use,
    init,
    registerTheme,
    registerMap,
    getMap,
    default: { use, init, registerTheme, registerMap, getMap },
  };
});

import { ChoroplethChart } from "../choropleth-chart";

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
        expect(series.data).toEqual([{ name: "France", value: 4 }]);
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
    const note = await screen.findByRole("status", {}, { timeout: 15_000 });
    expect(note).toHaveTextContent("2 rows not matched to a country");
    expect(note).toHaveTextContent("Narnia");
    expect(note).toHaveTextContent("Atlantis");
  }, 20_000);

  it("shows no note when every row matched", async () => {
    render(<ChoroplethChart data={data} />);
    await waitFor(() => expect(lastOptionWith("series")).toBeDefined(), {
      timeout: 15_000,
    });
    expect(screen.queryByRole("status")).toBeNull();
  }, 20_000);
});
