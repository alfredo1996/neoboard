import { describe, it, expect, vi } from "vitest";

// Stub component — used by vi.mock to satisfy dynamic import() calls
const Stub = () => null;

vi.mock("@neoboard/components", () => ({
  BarChart: Stub,
  LineChart: Stub,
  PieChart: Stub,
  SingleValueChart: Stub,
  GraphChart: Stub,
  MapChart: Stub,
  JsonViewer: Stub,
  MarkdownWidget: Stub,
  IframeWidget: Stub,
  GaugeChart: Stub,
  SankeyChart: Stub,
  SunburstChart: Stub,
  RadarChart: Stub,
  TreemapChart: Stub,
}));

vi.mock("@/components/table-renderer", () => ({
  TableRenderer: Stub,
}));

vi.mock("@/components/parameter-widget-renderer", () => ({
  ParameterWidgetRenderer: Stub,
}));

vi.mock("@/components/form-widget-renderer", () => ({
  FormWidgetRenderer: Stub,
}));

describe("chart-registry delegates to pluginRegistry", () => {
  it("getChartConfig returns adapted data from a registered plugin", async () => {
    // Import after mocks are set up
    const { getChartConfig } = await import("../chart-registry");

    const config = getChartConfig("bar");
    expect(config).toBeDefined();
    expect(config!.type).toBe("bar");
    expect(config!.label).toBe("Bar Chart");
    expect(typeof config!.transform).toBe("function");
    expect(typeof config!.transformWithMapping).toBe("function");
    expect(typeof config!.component).toBe("function");
    // component is a lazy loader that returns { default: Component }
    const mod = await config!.component!();
    expect(mod).toHaveProperty("default");
  });

  it("chartRegistry proxy exposes all registered types via Object.keys", async () => {
    const { chartRegistry } = await import("../chart-registry");
    const keys = Object.keys(chartRegistry);
    expect(keys).toContain("bar");
    expect(keys).toContain("line");
    expect(keys).toContain("pie");
    expect(keys).toContain("table");
    expect(keys.length).toBeGreaterThanOrEqual(17);
  });

  it("chartRegistry proxy returns ChartConfig for property access", async () => {
    const { chartRegistry } = await import("../chart-registry");
    const barConfig = chartRegistry.bar;
    expect(barConfig).toBeDefined();
    expect(barConfig.type).toBe("bar");
    expect(barConfig.label).toBe("Bar Chart");
  });

  it("chartRegistry proxy returns undefined for unknown types", async () => {
    const { chartRegistry } = await import("../chart-registry");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unknown = (chartRegistry as any)["nonexistent-chart"];
    expect(unknown).toBeUndefined();
  });

  it("adapted config includes supportsColumnMapping for bar/line/pie", async () => {
    const { getChartConfig } = await import("../chart-registry");
    expect(getChartConfig("bar")!.supportsColumnMapping).toBe(true);
    expect(getChartConfig("line")!.supportsColumnMapping).toBe(true);
    expect(getChartConfig("pie")!.supportsColumnMapping).toBe(true);
    expect(getChartConfig("table")!.supportsColumnMapping).toBe(false);
    expect(getChartConfig("json")!.supportsColumnMapping).toBe(false);
  });

  it("adapted config maps plugin capabilities correctly", async () => {
    const { getChartConfig } = await import("../chart-registry");

    const singleValue = getChartConfig("single-value")!;
    expect(singleValue.supportsClickAction).toBe(false);
    expect(singleValue.isECharts).toBe(true);
    expect(singleValue.supportsStyling).toBe(true);

    const json = getChartConfig("json")!;
    expect(json.supportsClickAction).toBe(false);
    expect(json.supportsStyling).toBe(false);

    const markdown = getChartConfig("markdown")!;
    expect(markdown.requiresQuery).toBe(false);
    expect(markdown.supportsClickAction).toBe(false);
  });
});
