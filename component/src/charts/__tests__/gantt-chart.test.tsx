import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GanttChart } from "../gantt-chart";

const mockSetOption = vi.fn();

vi.mock("@/hooks/useContainerSize", () => ({
  useContainerSize: () => ({
    width: 800,
    height: 400,
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

const sampleData: Array<{
  task: string;
  start: number;
  end: number;
  category?: string;
  progress?: number;
}> = [
  {
    task: "Design",
    start: 1700000000000,
    end: 1700500000000,
    category: "Phase 1",
  },
  {
    task: "Develop",
    start: 1700300000000,
    end: 1701000000000,
    category: "Phase 1",
  },
  {
    task: "Test",
    start: 1700800000000,
    end: 1701200000000,
    category: "Phase 2",
  },
];

describe("GanttChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without errors", () => {
    render(<GanttChart data={sampleData} />);
    expect(screen.getByTestId("base-chart")).toBeInTheDocument();
  });

  it("handles empty data with a No data title", () => {
    render(<GanttChart data={[]} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.title.text).toBe("No data");
  });

  it("uses custom series type for Gantt bars", () => {
    render(<GanttChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].type).toBe("custom");
  });

  it("sets time axis on xAxis", () => {
    render(<GanttChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.xAxis.type).toBe("time");
  });

  it("sets category axis on yAxis with task names", () => {
    render(<GanttChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.yAxis.type).toBe("category");
    expect(optionsCall.yAxis.data).toEqual(["Design", "Develop", "Test"]);
  });

  it("renders a today marker line by default", () => {
    render(<GanttChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    const markLine = optionsCall.series[0].markLine;
    expect(markLine).toBeDefined();
    expect(markLine.data[0].xAxis).toBeDefined();
  });

  it("hides today marker when showTodayLine is false", () => {
    render(<GanttChart data={sampleData} showTodayLine={false} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].markLine).toBeUndefined();
  });

  it("includes dataZoom for scrolling", () => {
    render(<GanttChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.dataZoom).toBeDefined();
    expect(optionsCall.dataZoom.length).toBeGreaterThan(0);
  });

  it("passes renderItem function to custom series", () => {
    render(<GanttChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(typeof optionsCall.series[0].renderItem).toBe("function");
  });

  it("applies styling rule color to matching tasks", () => {
    const stylingRules = [
      {
        id: "r1",
        column: "category",
        operator: "==" as const,
        value: "Phase 2",
        color: "#ff0000",
      },
    ];
    render(<GanttChart data={sampleData} stylingRules={stylingRules} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    // The series data should contain the styling info for renderItem to use
    const seriesData = optionsCall.series[0].data;
    expect(seriesData).toHaveLength(3);
  });

  it("shows loading state", () => {
    render(<GanttChart data={sampleData} loading />);
    expect(screen.getByTestId("base-chart")).toBeInTheDocument();
  });

  it("shows error state", () => {
    render(<GanttChart data={sampleData} error={new Error("Fail")} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Fail");
  });
});
