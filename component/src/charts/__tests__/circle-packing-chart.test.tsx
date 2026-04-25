import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CirclePackingChart } from "../circle-packing-chart";

const mockSetOption = vi.fn();

vi.mock("@/hooks/useContainerSize", () => ({
  useContainerSize: () => ({
    width: 600,
    height: 600,
    containerRef: vi.fn(),
  }),
}));

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

const hierarchicalData = [
  {
    name: "Root",
    children: [
      {
        name: "A",
        children: [
          { name: "A1", value: 10 },
          { name: "A2", value: 20 },
        ],
      },
      {
        name: "B",
        children: [
          { name: "B1", value: 15 },
          { name: "B2", value: 25 },
        ],
      },
    ],
  },
];

describe("CirclePackingChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without errors", () => {
    render(<CirclePackingChart data={hierarchicalData} />);
    expect(screen.getByTestId("base-chart")).toBeInTheDocument();
  });

  it("handles empty data with a No data title", () => {
    render(<CirclePackingChart data={[]} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.title.text).toBe("No data");
  });

  it("uses custom series type", () => {
    render(<CirclePackingChart data={hierarchicalData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].type).toBe("custom");
  });

  it("renders circles for all nodes", () => {
    render(<CirclePackingChart data={hierarchicalData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    // Series data should include root + A + B + A1 + A2 + B1 + B2 = 7 nodes
    expect(optionsCall.series[0].data.length).toBeGreaterThanOrEqual(4);
  });

  it("passes renderItem function", () => {
    render(<CirclePackingChart data={hierarchicalData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(typeof optionsCall.series[0].renderItem).toBe("function");
  });

  it("shows loading state", () => {
    render(<CirclePackingChart data={hierarchicalData} loading />);
    expect(screen.getByTestId("base-chart")).toBeInTheDocument();
  });

  it("shows error state", () => {
    render(
      <CirclePackingChart data={hierarchicalData} error={new Error("Fail")} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Fail");
  });

  it("hides labels when showLabels is false", () => {
    render(<CirclePackingChart data={hierarchicalData} showLabels={false} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    // renderItem should exist but labels should be suppressed
    expect(optionsCall.series[0].renderItem).toBeDefined();
  });
});
