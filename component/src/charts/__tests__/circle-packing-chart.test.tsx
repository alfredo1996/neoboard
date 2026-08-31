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

  // [x, y, r, depth, value, color, name, kind]; kind 0 = circle(+leaf label),
  // 1 = parent-label pass. depth 2 = maxDepth (leaf) for hierarchicalData.
  function leafText(color: string) {
    render(<CirclePackingChart data={hierarchicalData} />);
    const { renderItem } = mockSetOption.mock.calls[0][0].series[0];
    const vals = [120, 120, 40, 2, 50, color, "React", 0];
    const api = { value: (d: number) => vals[d], style: () => ({}) };
    const group = renderItem(undefined, api) as {
      children: { type: string; style?: Record<string, unknown> }[];
    };
    return group.children.find((c) => c.type === "text");
  }

  it("labels dark circles with white text (per-cell contrast, no outline)", () => {
    const text = leafText("#5470c6"); // dark blue
    expect(text?.style?.fill).toBe("#ffffff");
    expect(text?.style?.stroke).toBeUndefined();
  });

  it("labels light circles with black text (per-cell contrast)", () => {
    const text = leafText("#91cc75"); // light moss green
    expect(text?.style?.fill).toBe("#000000");
  });

  it("renders parent labels as a top-rim pill drawn on top (separate pass)", () => {
    render(<CirclePackingChart data={hierarchicalData} />);
    const { renderItem } = mockSetOption.mock.calls[0][0].series[0];
    // kind 1 = parent-label entry -> returns a standalone pill text element.
    const vals = [120, 120, 40, 1, 50, "", "Backend", 1];
    const api = { value: (d: number) => vals[d], style: () => ({}) };
    const el = renderItem(undefined, api) as {
      type: string;
      style?: Record<string, unknown>;
    };
    expect(el.type).toBe("text");
    expect(el.style?.text).toBe("Backend");
    expect(el.style?.backgroundColor).toBe("rgba(0, 0, 0, 0.55)");
    expect(el.style?.fill).toBe("#ffffff");
    expect(el.style?.y as number).toBeLessThan(120); // top rim
  });

  it("emits parent-label entries after all circle entries (z-order on top)", () => {
    render(<CirclePackingChart data={hierarchicalData} />);
    const data = mockSetOption.mock.calls[0][0].series[0].data as {
      value: unknown[];
    }[];
    const kinds = data.map((d) => d.value[7]);
    const firstLabel = kinds.indexOf(1);
    const lastCircle = kinds.lastIndexOf(0);
    expect(firstLabel).toBeGreaterThan(-1); // there are parent labels
    expect(firstLabel).toBeGreaterThan(lastCircle); // ...and they come last
  });

  it("fills depth circles from the citrine palette (no stock ECharts colors)", () => {
    render(<CirclePackingChart data={hierarchicalData} />);
    const { renderItem } = mockSetOption.mock.calls[0][0].series[0];
    // depth 1, no per-node color -> falls back to the citrine depth palette.
    const vals = [120, 120, 40, 1, 50, "", "Frontend", 0];
    const api = { value: (d: number) => vals[d], style: () => ({}) };
    const group = renderItem(undefined, api) as {
      children: { type: string; shape?: object; style?: { fill?: string } }[];
    };
    const circle = group.children.find((c) => c.type === "circle");
    expect(circle?.style?.fill).toContain("hsl");
    expect(circle?.style?.fill).not.toBe("#5470c6");
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

/**
 * #1551 — circle packing advertised click actions it could not deliver.
 *
 * The plugin declares `supportsClickAction: true` and the docs promise "click
 * a circle to navigate or set a parameter", but the series items were emitted
 * as bare `{ value: [...] }` with no `name`, so ECharts' `params.name` was
 * always "". And the shared `useEChartsClick` looks the row up as
 * `data[e.dataIndex]` — `data` is the hierarchical tree while `dataIndex`
 * lives in flattened-packed-node space, two unrelated orderings.
 *
 * So a click produced an empty name and an arbitrary row, or none. Treemap and
 * sunburst are unaffected: their native series populate params.name from the
 * node.
 *
 * The value array stays as-is (renderItem reads it by index); the semantic
 * fields ride alongside it, where ECharts exposes them as `params.data`.
 */
describe("CirclePackingChart click payload (#1551)", () => {
  const hierarchy = [
    {
      name: "root",
      children: [
        { name: "alpha", value: 10 },
        { name: "beta", value: 20 },
      ],
    },
  ];

  function seriesData() {
    mockSetOption.mockClear();
    render(<CirclePackingChart data={hierarchy} />);
    const opts =
      mockSetOption.mock.calls[mockSetOption.mock.calls.length - 1][0];
    return opts.series[0].data as Record<string, unknown>[];
  }

  it("gives every item a resolvable name", () => {
    const items = seriesData();
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(typeof item.name).toBe("string");
      expect(item.name).not.toBe("");
    }
  });

  it("names items after their node", () => {
    const names = seriesData().map((i) => i.name);
    expect(names).toContain("alpha");
    expect(names).toContain("beta");
  });

  it("carries the node's own value, not the packed geometry", () => {
    const alpha = seriesData().find((i) => i.name === "alpha")!;
    expect(alpha.nodeValue).toBe(10);
  });

  it("still encodes the geometry array renderItem reads by index", () => {
    const alpha = seriesData().find((i) => i.name === "alpha")!;
    const value = alpha.value as number[];
    expect(Array.isArray(value)).toBe(true);
    // [x, y, r, depth, value, color, name, kind]
    expect(value).toHaveLength(8);
    expect(value[6]).toBe("alpha");
  });
});
