import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BaseChart } from "../base-chart";

// echarts/charts, echarts/components, echarts/renderers are mocked globally
// in vitest.setup.ts. Only echarts/core is mocked here to capture specific fns.
const mockSetOption = vi.fn();
const mockResize = vi.fn();
const mockDispose = vi.fn();
const mockOn = vi.fn();
const mockOff = vi.fn();
const mockShowLoading = vi.fn();
const mockHideLoading = vi.fn();
const mockClear = vi.fn();

vi.mock("echarts/core", () => {
  const use = vi.fn();
  const registerTheme = vi.fn();
  const init = vi.fn(() => ({
    setOption: mockSetOption,
    resize: mockResize,
    dispose: mockDispose,
    on: mockOn,
    off: mockOff,
    showLoading: mockShowLoading,
    hideLoading: mockHideLoading,
    clear: mockClear,
  }));
  return { use, init, registerTheme, default: { use, init, registerTheme } };
});

vi.mock("echarts/components", () => ({
  TitleComponent: vi.fn(),
  TooltipComponent: vi.fn(),
  LegendComponent: vi.fn(),
  GridComponent: vi.fn(),
  DataZoomComponent: vi.fn(),
  AriaComponent: vi.fn(),
  RadarComponent: vi.fn(),
  MarkLineComponent: vi.fn(),
  GraphicComponent: vi.fn(),
}));

describe("BaseChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a chart container", () => {
    render(<BaseChart options={{}} />);
    expect(screen.getByTestId("base-chart")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    render(<BaseChart options={{}} className="my-chart" />);
    expect(screen.getByTestId("base-chart")).toHaveClass("my-chart");
  });

  it("calls onChartReady when initialized", () => {
    const onReady = vi.fn();
    render(<BaseChart options={{}} onChartReady={onReady} />);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("sets ECharts options", () => {
    const options = { title: { text: "Test" } };
    render(<BaseChart options={options} />);
    expect(mockSetOption).toHaveBeenCalledWith(
      expect.objectContaining({ title: { text: "Test" } }),
      { notMerge: true },
    );
  });

  it("disposes chart on unmount", () => {
    const { unmount } = render(<BaseChart options={{}} />);
    unmount();
    expect(mockDispose).toHaveBeenCalledTimes(1);
  });

  it("shows loading state", () => {
    render(<BaseChart options={{}} loading />);
    expect(mockShowLoading).toHaveBeenCalled();
  });

  it("hides loading when loading prop is false", () => {
    render(<BaseChart options={{}} loading={false} />);
    expect(mockHideLoading).toHaveBeenCalled();
  });

  it("renders error state instead of chart", () => {
    render(<BaseChart options={{}} error={new Error("Failed to load")} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Failed to load");
    expect(screen.queryByTestId("base-chart")).not.toBeInTheDocument();
  });

  it("surfaces a render error (setOption throws) instead of crashing the widget", () => {
    // ECharts throws synchronously on malformed data (e.g. a cyclic Sankey).
    mockSetOption.mockImplementationOnce(() => {
      throw new Error("Sankey is a DAG, the original data has cycle");
    });
    render(<BaseChart options={{ series: [{ type: "sankey" }] }} />);
    // Container stays mounted (ECharts instance keeps its DOM binding)...
    expect(screen.getByTestId("base-chart")).toBeInTheDocument();
    // ...and the error is shown, not thrown.
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Chart failed to render");
    expect(alert).toHaveTextContent("data has cycle");
    // The half-drawn chart is cleared.
    expect(mockClear).toHaveBeenCalled();
  });

  it("registers click handler", () => {
    const onClick = vi.fn();
    render(<BaseChart options={{}} onClick={onClick} />);
    expect(mockOn).toHaveBeenCalledWith("click", expect.any(Function));
  });

  it("registers dataZoom handler", () => {
    const onDataZoom = vi.fn();
    render(<BaseChart options={{}} onDataZoom={onDataZoom} />);
    expect(mockOn).toHaveBeenCalledWith("dataZoom", onDataZoom);
  });

  it("cleans up event handlers on unmount", () => {
    const onClick = vi.fn();
    const { unmount } = render(<BaseChart options={{}} onClick={onClick} />);
    unmount();
    expect(mockOff).toHaveBeenCalledWith("click");
    expect(mockOff).toHaveBeenCalledWith("dataZoom");
  });

  it("includes chart colors in default options", () => {
    render(<BaseChart options={{ title: { text: "Test" } }} />);
    expect(mockSetOption).toHaveBeenCalledWith(
      expect.objectContaining({
        color: expect.arrayContaining(["hsl(38, 95%, 55%)"]),
      }),
      { notMerge: true },
    );
  });

  it("enables aria by default", () => {
    render(<BaseChart options={{ title: { text: "Test" } }} />);
    expect(mockSetOption).toHaveBeenCalledWith(
      expect.objectContaining({
        aria: expect.objectContaining({ enabled: true }),
      }),
      { notMerge: true },
    );
  });

  it("decal patterns are off by default", () => {
    render(<BaseChart options={{ title: { text: "Test" } }} />);
    expect(mockSetOption).toHaveBeenCalledWith(
      expect.objectContaining({
        aria: expect.objectContaining({ decal: { show: false } }),
      }),
      { notMerge: true },
    );
  });

  it("enables decal patterns in colorblind mode", () => {
    render(<BaseChart options={{ title: { text: "Test" } }} colorblindMode />);
    expect(mockSetOption).toHaveBeenCalledWith(
      expect.objectContaining({
        aria: expect.objectContaining({ decal: { show: true } }),
      }),
      { notMerge: true },
    );
  });

  it("chart container has aria-label for screen readers", () => {
    render(<BaseChart options={{}} />);
    expect(screen.getByLabelText("Chart visualization")).toBeInTheDocument();
  });

  it("uses default palette colors when no colorPalette is specified", () => {
    render(<BaseChart options={{ title: { text: "Test" } }} />);
    // Default uses resolveChartColors() which falls back to CITRINE_LIGHT
    expect(mockSetOption).toHaveBeenCalledWith(
      expect.objectContaining({
        color: expect.arrayContaining(["hsl(38, 95%, 55%)"]),
      }),
      { notMerge: true },
    );
  });

  it("uses default palette colors when colorPalette is 'deep-ocean'", () => {
    render(
      <BaseChart
        options={{ title: { text: "Test" } }}
        colorPalette="deep-ocean"
      />,
    );
    // deep-ocean triggers the default CSS-var path (same as unset)
    expect(mockSetOption).toHaveBeenCalledWith(
      expect.objectContaining({
        color: expect.arrayContaining(["hsl(38, 95%, 55%)"]),
      }),
      { notMerge: true },
    );
  });

  it("overrides colors with tableau palette when colorPalette is set", () => {
    render(
      <BaseChart
        options={{ title: { text: "Test" } }}
        colorPalette="tableau"
      />,
    );
    expect(mockSetOption).toHaveBeenCalledWith(
      expect.objectContaining({
        color: expect.arrayContaining(["#4e79a7"]),
      }),
      { notMerge: true },
    );
  });

  it("overrides colors with observable palette when colorPalette is set", () => {
    render(<BaseChart options={{}} colorPalette="observable" />);
    expect(mockSetOption).toHaveBeenCalledWith(
      expect.objectContaining({
        color: expect.arrayContaining(["#4269d0"]),
      }),
      { notMerge: true },
    );
  });

  it("falls back to default colors when an unknown colorPalette is provided", () => {
    render(<BaseChart options={{}} colorPalette="does-not-exist" />);
    // getPaletteColors returns undefined for unknown IDs → falls back to resolveChartColors
    expect(mockSetOption).toHaveBeenCalledWith(
      expect.objectContaining({
        color: expect.arrayContaining(["hsl(38, 95%, 55%)"]),
      }),
      { notMerge: true },
    );
  });

  // --- DataZoom ---

  it("does not include dataZoom by default", () => {
    render(<BaseChart options={{ title: { text: "Test" } }} />);
    const call = mockSetOption.mock.calls[0][0];
    expect(call.dataZoom).toBeUndefined();
  });

  it("injects dataZoom config when enableDataZoom is true", () => {
    render(<BaseChart options={{ title: { text: "Test" } }} enableDataZoom />);
    const call = mockSetOption.mock.calls[0][0];
    expect(call.dataZoom).toBeDefined();
    expect(Array.isArray(call.dataZoom)).toBe(true);
    expect(call.dataZoom).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "inside" })]),
    );
  });

  it("does not inject dataZoom when enableDataZoom is false", () => {
    render(
      <BaseChart
        options={{ title: { text: "Test" } }}
        enableDataZoom={false}
      />,
    );
    const call = mockSetOption.mock.calls[0][0];
    expect(call.dataZoom).toBeUndefined();
  });

  // --- Dark mode via events ---

  describe("dark mode reactivity", () => {
    afterEach(() => {
      document.documentElement.classList.remove("dark");
    });

    it("re-renders chart when neoboard-theme-change event fires", () => {
      const onReady = vi.fn();
      render(<BaseChart options={{}} onChartReady={onReady} />);
      const callsBefore = onReady.mock.calls.length;

      // Simulate app theme toggle: add dark class + fire custom event
      act(() => {
        document.documentElement.classList.add("dark");
        globalThis.dispatchEvent(new Event("neoboard-theme-change"));
      });

      // Chart should reinitialize (new onChartReady call)
      expect(onReady.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });
});
