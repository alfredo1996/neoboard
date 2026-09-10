import { aliasNeedingRegions } from "./fixtures/connector-output";
import { render, screen, waitFor } from "@testing-library/react";
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
    expect(ramp[0]).toBe("#fff7d6"); // pale citrine min default
    expect(ramp[ramp.length - 1]).toBe("#993404"); // deep amber max default
    expect(ramp).not.toContain("#2171b5"); // no stock blue stop
  }, 15000);
});

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
        expect(visualMap.inRange.color).toEqual([
          "#fff7d6",
          "#e6c6a2",
          "#cc966d",
          "#b36539",
          "#993404",
        ]);
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
  // the ends' lightness so the highest value is the most prominent.
  it("inverts the ramp's lightness in dark mode", async () => {
    document.documentElement.classList.add("dark");
    render(<ChoroplethChart data={data} />);
    await waitFor(
      () =>
        expect(lastOptionWith("series").visualMap.inRange.color).toEqual([
          "#292100",
          "#5e3e1a",
          "#925c33",
          "#c7794d",
          "#fb9666",
        ]),
      { timeout: 15_000 },
    );
  }, 20_000);
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
          "United States",
          "Czechia",
        ]);
      },
      { timeout: 15_000 },
    );
  });
});
