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
    const stylingRules = [{ id: "r1", operator: ">=" as const, value: 10, color: "#ff0000" }];
    render(<SankeyChart data={sampleData} stylingRules={stylingRules} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    const links = optionsCall.series[0].links;
    // First link has value 10 which matches >= 10
    expect(links[0].lineStyle?.color).toBe("#ff0000");
  });

  it("does not apply color to link when value does not match styling rule", () => {
    const stylingRules = [{ id: "r1", operator: ">" as const, value: 10, color: "#ff0000" }];
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
    const stylingRules = [{ id: "r1", operator: ">=" as const, value: 5, color: "#00ff00" }];
    const paramValues = { threshold: 5 };
    render(<SankeyChart data={sampleData} stylingRules={stylingRules} paramValues={paramValues} />);
    expect(screen.getByTestId("base-chart")).toBeInTheDocument();
  });
});
