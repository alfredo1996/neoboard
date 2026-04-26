import { describe, it, expect, vi } from "vitest";

const { Stub } = vi.hoisted(() => ({ Stub: () => null }));

vi.mock("@neoboard/components", () => ({
  getChartOptions: () => [],
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
  EmptyState: Stub,
  Skeleton: Stub,
}));

vi.mock("next/dynamic", () => ({
  default: (fn: () => Promise<{ default: unknown }>) => {
    try {
      const mod = fn();
      if (
        mod &&
        typeof (mod as Promise<{ default: unknown }>).then === "function"
      )
        return Stub;
    } catch {
      /* noop */
    }
    return Stub;
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

vi.mock("@/components/table-renderer", () => ({ TableRenderer: Stub }));
vi.mock("@/components/parameter-widget-renderer", () => ({
  ParameterWidgetRenderer: Stub,
}));
vi.mock("@/components/form-widget-renderer", () => ({
  FormWidgetRenderer: Stub,
}));
vi.mock("@/components/graph-exploration-wrapper", () => ({
  GraphExplorationWrapper: Stub,
}));

// Ensure plugins are registered before importing helpers.
import "@/plugins/index";
import {
  getChartConfig,
  chartSupportsClickAction,
  chartSupportsStyling,
  getStylingTargets,
  getCompatibleChartTypes,
  chartRequiresQuery,
  getChartDefaults,
  supportsColumnMapping,
  getAllChartTypes,
  CHART_TYPES,
} from "@/lib/plugin/chart-helpers";

// ---------------------------------------------------------------------------
// getChartConfig
// ---------------------------------------------------------------------------
describe("getChartConfig", () => {
  it("returns a plugin for a registered type", () => {
    const config = getChartConfig("bar");
    expect(config).toBeDefined();
    expect(config!.type).toBe("bar");
    expect(config!.label).toBe("Bar Chart");
  });

  it("returns undefined for an unknown type", () => {
    expect(getChartConfig("nonexistent")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// chartSupportsClickAction
// ---------------------------------------------------------------------------
describe("chartSupportsClickAction", () => {
  it("returns true for bar (supports click)", () => {
    expect(chartSupportsClickAction("bar")).toBe(true);
  });

  it("returns false for single-value (no click)", () => {
    expect(chartSupportsClickAction("single-value")).toBe(false);
  });

  it("returns false for unknown types", () => {
    expect(chartSupportsClickAction("unknown")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// chartSupportsStyling
// ---------------------------------------------------------------------------
describe("chartSupportsStyling", () => {
  it("returns true for bar", () => {
    expect(chartSupportsStyling("bar")).toBe(true);
  });

  it("returns false for json", () => {
    expect(chartSupportsStyling("json")).toBe(false);
  });

  it("returns false for unknown types", () => {
    expect(chartSupportsStyling("unknown")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getStylingTargets
// ---------------------------------------------------------------------------
describe("getStylingTargets", () => {
  it("returns targets for bar chart", () => {
    const targets = getStylingTargets("bar");
    expect(targets.length).toBeGreaterThan(0);
    expect(targets[0]).toHaveProperty("value");
    expect(targets[0]).toHaveProperty("label");
  });

  it("returns empty array for json (no styling)", () => {
    expect(getStylingTargets("json")).toEqual([]);
  });

  it("returns empty array for unknown types", () => {
    expect(getStylingTargets("unknown")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getCompatibleChartTypes
// ---------------------------------------------------------------------------
describe("getCompatibleChartTypes", () => {
  it("returns all types for neo4j", () => {
    const types = getCompatibleChartTypes("neo4j");
    expect(types).toContain("bar");
    expect(types).toContain("graph");
  });

  it("returns types excluding graph for postgresql", () => {
    const types = getCompatibleChartTypes("postgresql");
    expect(types).toContain("bar");
    expect(types).not.toContain("graph");
  });

  it("returns empty array for invalid connector type", () => {
    expect(getCompatibleChartTypes("invalid")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// chartRequiresQuery
// ---------------------------------------------------------------------------
describe("chartRequiresQuery", () => {
  it("returns true for bar", () => {
    expect(chartRequiresQuery("bar")).toBe(true);
  });

  it("returns false for markdown", () => {
    expect(chartRequiresQuery("markdown")).toBe(false);
  });

  it("defaults to true for unknown types", () => {
    expect(chartRequiresQuery("unknown")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getChartDefaults
// ---------------------------------------------------------------------------
describe("getChartDefaults", () => {
  it("returns defaults from settings schema when available", () => {
    const defaults = getChartDefaults("bar");
    // Bar plugin has a Zod schema with defaults — should extract them
    expect(typeof defaults).toBe("object");
  });

  it("returns empty object for unknown type", () => {
    expect(getChartDefaults("unknown_type_xyz")).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// supportsColumnMapping
// ---------------------------------------------------------------------------
describe("supportsColumnMapping", () => {
  it("returns true for types with transformWithMapping", () => {
    // bar, line, pie all define transformWithMapping
    expect(supportsColumnMapping("bar")).toBe(true);
    expect(supportsColumnMapping("line")).toBe(true);
    expect(supportsColumnMapping("pie")).toBe(true);
  });

  it("returns false for types without transformWithMapping", () => {
    // markdown has no transformWithMapping (content-only widget)
    expect(supportsColumnMapping("markdown")).toBe(false);
    expect(supportsColumnMapping("iframe")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getAllChartTypes
// ---------------------------------------------------------------------------
describe("getAllChartTypes", () => {
  it("returns all 20 registered types", () => {
    const types = getAllChartTypes();
    expect(types.length).toBe(20);
    for (const t of CHART_TYPES) {
      expect(types).toContain(t);
    }
  });
});
