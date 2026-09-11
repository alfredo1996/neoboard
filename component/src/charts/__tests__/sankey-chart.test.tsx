import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SankeyChart } from "../sankey-chart";

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
  return { use, init, registerTheme, default: { use, init, registerTheme } };
});

const sampleData = {
  nodes: [{ name: "A" }, { name: "B" }, { name: "C" }],
  links: [
    { source: "A", target: "B", value: 10 },
    { source: "B", target: "C", value: 5 },
  ],
};

describe("SankeyChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without errors", () => {
    render(<SankeyChart data={sampleData} />);
    expect(screen.getByTestId("base-chart")).toBeInTheDocument();
  });

  it("handles empty nodes/links with a No data title", () => {
    render(<SankeyChart data={{ nodes: [], links: [] }} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.title.text).toBe("No data");
  });

  it("sets sankey type on series", () => {
    render(<SankeyChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].type).toBe("sankey");
  });

  it("passes nodes and links to series", () => {
    render(<SankeyChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].data).toEqual(sampleData.nodes);
  });

  it("shows loading state", () => {
    render(<SankeyChart data={sampleData} loading />);
    expect(screen.getByTestId("base-chart")).toBeInTheDocument();
  });

  it("shows error state", () => {
    render(<SankeyChart data={sampleData} error={new Error("Fail")} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Fail");
  });

  // --- styling rules ---

  it("applies styling rule color to link lineStyle when value matches rule", () => {
    const stylingRules = [
      { id: "r1", operator: ">=" as const, value: 10, color: "#ff0000" },
    ];
    render(<SankeyChart data={sampleData} stylingRules={stylingRules} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    const links = optionsCall.series[0].links;
    // First link has value 10 which matches >= 10
    expect(links[0].lineStyle?.color).toBe("#ff0000");
  });

  it("does not apply color to link when value does not match styling rule", () => {
    const stylingRules = [
      { id: "r1", operator: ">" as const, value: 10, color: "#ff0000" },
    ];
    render(<SankeyChart data={sampleData} stylingRules={stylingRules} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    const links = optionsCall.series[0].links;
    // First link has value 10, rule is > 10 (strict), so no match
    expect(links[0].lineStyle?.color).toBeUndefined();
  });

  it("passes raw links through when no stylingRules provided", () => {
    render(<SankeyChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].links).toEqual(sampleData.links);
  });

  it("accepts paramValues prop without error", () => {
    const stylingRules = [
      { id: "r1", operator: ">=" as const, value: 5, color: "#00ff00" },
    ];
    const paramValues = { threshold: 5 };
    render(
      <SankeyChart
        data={sampleData}
        stylingRules={stylingRules}
        paramValues={paramValues}
      />,
    );
    expect(screen.getByTestId("base-chart")).toBeInTheDocument();
  });

  describe("duplicate node names (#1667)", () => {
    // ECharts keys sankey nodes by name and throws from its layout on a
    // duplicate ("Cannot set properties of undefined (setting 'dataIndex')").
    // The app's transform already dedupes; the component must too, for
    // direct callers and the external chart-plugin seam.
    const mine = () =>
      mockSetOption.mock.calls
        .map((c) => c[0])
        .find((o) => o?.series?.[0]?.type === "sankey");

    it("collapses duplicate node names to one node each", () => {
      mockSetOption.mockClear();
      render(
        <SankeyChart
          data={{
            nodes: [{ name: "A" }, { name: "A" }, { name: "B" }],
            links: [{ source: "A", target: "B", value: 5 }],
          }}
        />,
      );
      expect(mine()?.series[0].data).toEqual([{ name: "A" }, { name: "B" }]);
      expect(mine()?.series[0].links).toEqual([
        { source: "A", target: "B", value: 5 },
      ]);
    });

    it("still tolerates a link to a node that was not declared", () => {
      mockSetOption.mockClear();
      render(
        <SankeyChart
          data={{
            nodes: [{ name: "A" }],
            links: [{ source: "A", target: "Nope", value: 1 }],
          }}
        />,
      );
      expect(mine()?.series[0].links).toHaveLength(1);
    });
  });

  // The app's sankey transform keeps the query row under `properties` on each
  // link, and the click payload reads it off the clicked link (#1598).
  describe("keeps the caller's extra keys on each link (#1598)", () => {
    const withRows = {
      nodes: sampleData.nodes,
      links: sampleData.links.map((l) => ({
        ...l,
        properties: { dst: l.target },
      })),
    };

    it.each([
      ["plain", undefined],
      [
        "styling rules",
        [{ id: "r1", operator: ">=" as const, value: 0, color: "#f00" }],
      ],
    ])("%s", (_label, stylingRules) => {
      render(<SankeyChart data={withRows} stylingRules={stylingRules} />);
      const links = mockSetOption.mock.calls[0][0].series[0].links as Array<{
        properties?: { dst: string };
      }>;
      expect(links.map((l) => l.properties)).toEqual(
        withRows.links.map((l) => l.properties),
      );
    });
  });
});
