import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TreemapChart } from "../treemap-chart";

// echarts/charts, echarts/components, echarts/renderers are mocked globally
// in vitest.setup.ts. Only echarts/core is mocked here to capture setOption.
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
  // The tooltip escapes through echarts.format; the real helper is a pure
  // string function, so the mock uses the same escaping rather than a stub
  // that would let an unescaped value pass the test.
  const format = {
    encodeHTML: (s: unknown) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;"),
  };
  return {
    use,
    init,
    registerTheme,
    format,
    default: { use, init, registerTheme, format },
  };
});

const sampleData = [
  { name: "Alpha", value: 100 },
  { name: "Beta", value: 200 },
  { name: "Gamma", value: 50 },
];

describe("TreemapChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without errors", () => {
    render(<TreemapChart data={sampleData} />);
    expect(screen.getByTestId("base-chart")).toBeInTheDocument();
  });

  it("handles empty data with a No data title", () => {
    render(<TreemapChart data={[]} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.title.text).toBe("No data");
  });

  it("sets treemap type on series", () => {
    render(<TreemapChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].type).toBe("treemap");
  });

  it("keeps every datum and gives each tile a fill", () => {
    // Flat data is one hue: area already carries the value, so a different
    // colour per tile would encode nothing (#1405).
    render(<TreemapChart data={sampleData} />);
    const tiles = mockSetOption.mock.calls[0][0].series[0].data;
    expect(tiles.map((t: { name: string }) => t.name)).toEqual(
      sampleData.map((d) => d.name),
    );
    const fills = tiles.map(
      (t: { itemStyle: { color: string } }) => t.itemStyle.color,
    );
    expect(new Set(fills).size).toBe(1);
    expect(fills[0]).toBeTruthy();
  });

  it("labels are white with a soft shadow so they read on light- and dark-tinted cells", () => {
    render(<TreemapChart data={sampleData} />);
    const { label } = mockSetOption.mock.calls[0][0].series[0];
    expect(label.color).toBe("#ffffff");
    expect(label.textShadowColor).toBe("rgba(0, 0, 0, 0.55)");
    expect(label.textShadowBlur).toBeGreaterThan(0);
  });

  it("shows loading state", () => {
    render(<TreemapChart data={sampleData} loading />);
    expect(screen.getByTestId("base-chart")).toBeInTheDocument();
  });

  it("shows error state", () => {
    render(<TreemapChart data={sampleData} error={new Error("Fail")} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Fail");
  });

  // --- styling rules ---

  it("applies styling rule color to items that match rule", () => {
    const stylingRules = [
      { id: "r1", operator: ">=" as const, value: 150, color: "#ff0000" },
    ];
    render(<TreemapChart data={sampleData} stylingRules={stylingRules} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    const seriesData = optionsCall.series[0].data;
    // Beta has value 200 which is >= 150
    const beta = seriesData.find((d: { name: string }) => d.name === "Beta");
    expect(beta?.itemStyle?.color).toBe("#ff0000");
  });

  it("does not apply color to items that do not match styling rule", () => {
    const stylingRules = [
      { id: "r1", operator: ">=" as const, value: 150, color: "#ff0000" },
    ];
    render(<TreemapChart data={sampleData} stylingRules={stylingRules} />);
    const seriesData = mockSetOption.mock.calls[0][0].series[0].data;
    // Alpha is 100, below the rule's 150, so it keeps the chart's own fill
    // rather than the rule colour (#1405 — every tile now carries a fill).
    const alpha = seriesData.find((d: { name: string }) => d.name === "Alpha");
    const beta = seriesData.find((d: { name: string }) => d.name === "Beta");
    expect(alpha?.itemStyle?.color).not.toBe("#ff0000");
    expect(alpha?.itemStyle?.color).toBeTruthy();
    expect(beta?.itemStyle?.color).toBe("#ff0000");
  });

  it("keeps every datum's own fields when no stylingRules are provided", () => {
    render(<TreemapChart data={sampleData} />);
    const tiles = mockSetOption.mock.calls[0][0].series[0].data;
    sampleData.forEach((row, i) => {
      expect(tiles[i]).toMatchObject(row);
    });
  });

  it("accepts paramValues prop without error", () => {
    const stylingRules = [
      { id: "r1", operator: ">=" as const, value: 100, color: "#00ff00" },
    ];
    const paramValues = { threshold: 100 };
    render(
      <TreemapChart
        data={sampleData}
        stylingRules={stylingRules}
        paramValues={paramValues}
      />,
    );
    expect(screen.getByTestId("base-chart")).toBeInTheDocument();
  });

  describe("native drill vs a configured click action (#1596)", () => {
    it("keeps native drill when no click action is configured", () => {
      render(<TreemapChart data={sampleData} />);
      const option = mockSetOption.mock.calls[0][0];
      expect(option.series[0].nodeClick).toBe("zoomToNode");
    });

    it("suppresses native drill when a click action is configured", () => {
      // Otherwise one click both fires the action and moves the view.
      render(<TreemapChart data={sampleData} onClick={() => {}} />);
      const option = mockSetOption.mock.calls[0][0];
      expect(option.series[0].nodeClick).toBe(false);
    });
  });

  describe("box geometry and breadcrumb (#1405)", () => {
    const nested = [
      { name: "Frontend", children: [{ name: "React", value: 10 }] },
      { name: "Backend", children: [{ name: "Go", value: 8 }] },
    ];

    it("drives the box with edges only", () => {
      // ECharts' box layout drops `right`/`bottom` as soon as `width`/`height`
      // are set, leaving the series' default 20px left and 50px top insets —
      // so the box ran off the right and bottom edges and clipped tiles.
      const series = renderSeries({ data: sampleData });
      expect(series.width).toBeUndefined();
      expect(series.height).toBeUndefined();
      expect(series.left).toBe(0);
      expect(series.top).toBe(0);
      expect(series.right).toBe(0);
    });

    it("reserves no bottom strip for flat data, which cannot be drilled", () => {
      const series = renderSeries({ data: sampleData });
      expect(series.bottom).toBe(0);
      expect(series.breadcrumb.show).toBe(false);
    });

    it("shows the breadcrumb and reserves room for it when the data has depth", () => {
      const series = renderSeries({ data: nested });
      expect(series.breadcrumb.show).toBe(true);
      expect(series.bottom).toBe(28);
    });

    it("gives groups past the third a single quiet fill", () => {
      const many = Array.from({ length: 5 }, (_, g) => ({
        name: `G${g}`,
        children: [{ name: `c${g}`, value: 5 }],
      }));
      const fills = renderSeries({ data: many }).data.map(
        (t: { itemStyle: { color: string } }) => t.itemStyle.color,
      );
      expect(new Set(fills.slice(0, 3)).size).toBe(3);
      expect(fills[3]).toBe(fills[4]);
    });

    it("separates tiles with a gap in the surface colour, not a border", () => {
      const series = renderSeries({ data: sampleData });
      expect(series.itemStyle.borderWidth).toBe(0);
      expect(series.itemStyle.gapWidth).toBe(2);
      expect(series.itemStyle.borderColor).toBe("#ffffff");
    });

    it("keeps upperLabel at series level so deep groups still get a header", () => {
      // levels[0] already scopes the root out; moving it per-level would drop
      // the header on any group deeper than levels[2].
      const series = renderSeries({ data: nested });
      expect(series.upperLabel.show).toBe(true);
      expect(series.levels[0].upperLabel.show).toBe(false);
    });
  });

  describe("tooltip and value labels (#1405)", () => {
    it("drops the virtual root from the path and formats the number", () => {
      const { tooltip } = renderOption({ data: sampleData });
      const html = tooltip.formatter({
        name: "React",
        value: 1234.5,
        treePathInfo: [{ name: "" }, { name: "Frontend" }, { name: "React" }],
      });
      expect(html).toContain("<b>1,234.5</b>");
      expect(html).toContain("Frontend / React");
      expect(html).not.toContain(" / Frontend");
    });

    it("falls back to the node name at the root", () => {
      const { tooltip } = renderOption({ data: sampleData });
      const html = tooltip.formatter({
        name: "All",
        value: 60,
        treePathInfo: [{ name: "All" }],
      });
      expect(html).toContain("All");
      expect(html).not.toContain("<br/> ");
    });

    it("formats the value on the tile when showValues is on", () => {
      const series = renderSeries({ data: sampleData, showValues: true });
      expect(series.label.formatter({ name: "A", value: 1234.5 })).toBe(
        "A: 1,234.5",
      );
    });

    it("shows the name alone when showValues is off", () => {
      expect(renderSeries({ data: sampleData }).label.formatter).toBe("{b}");
    });
  });
});

/** The option ECharts was handed. */
function renderOption(props: Parameters<typeof TreemapChart>[0]) {
  mockSetOption.mockClear();
  render(<TreemapChart {...props} />);
  return mockSetOption.mock.calls[0][0];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- option shape is ECharts', not ours
function renderSeries(props: Parameters<typeof TreemapChart>[0]): any {
  return renderOption(props).series[0];
}
