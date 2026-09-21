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
  GanttChart: Stub,
  ChoroplethChart: Stub,
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
  getSelectableChartTypes,
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
  // #1902: which charts a connection offers is decided by what the CONNECTOR
  // declares it can return, not by a list of connector names kept in the app.
  // A connector nobody has heard of gets every chart its capabilities allow.
  const graphCapable = { type: "fixturedb", supportsGraphData: true };
  const tabularOnly = { type: "otherdb", supportsGraphData: false };
  const unheardOf = { type: "brand-new-thing" };

  it("offers the graph chart to a connector that returns graph data", () => {
    const types = getCompatibleChartTypes(graphCapable);
    expect(types).toContain("bar");
    expect(types).toContain("graph");
  });

  it("withholds the graph chart from a connector that does not", () => {
    const types = getCompatibleChartTypes(tabularOnly);
    expect(types).toContain("bar");
    expect(types).not.toContain("graph");
  });

  it("treats an undeclared capability as absent, not as unknown", () => {
    const types = getCompatibleChartTypes(unheardOf);
    expect(types).toContain("bar");
    expect(types).not.toContain("graph");
  });

  it("offers charts to a connector the app has never heard of", () => {
    // The bug this replaces: getCompatibleChartTypes returned [] for any type
    // outside CONNECTOR_TYPES, so a third connector got no charts at all.
    expect(getCompatibleChartTypes(unheardOf).length).toBeGreaterThan(3);
  });

  it("offers every enabled chart when there is no connector yet", () => {
    const types = getCompatibleChartTypes(undefined);
    expect(types).toContain("bar");
    expect(types).toContain("graph");
  });

  // #1158 — ship fewer, better charts: these are disabled in the picker but
  // their plugins stay registered so existing dashboards keep rendering.
  it("excludes disabled chart types from the pickable list", () => {
    for (const descriptor of [graphCapable, tabularOnly]) {
      const types = getCompatibleChartTypes(descriptor);
      for (const disabled of ["choropleth", "radar"]) {
        expect(
          types,
          `${descriptor.type} should not offer ${disabled}`,
        ).not.toContain(disabled);
      }
    }
  });

  it("keeps disabled chart plugins registered so existing widgets still render", () => {
    // getChartConfig hits the registry directly (the render path) — must
    // still resolve so a saved radar/choropleth widget renders.
    for (const disabled of ["choropleth", "radar"]) {
      expect(getChartConfig(disabled), disabled).toBeDefined();
    }
  });

  it("registers neither treemap nor circle-packing, not even as a stub (#1687)", () => {
    // Unlike the disabled types above these are gone from the app entirely,
    // so the render path must fall through to "Unknown chart type".
    expect(getChartConfig("treemap")).toBeUndefined();
    expect(getChartConfig("circle-packing")).toBeUndefined();
    expect(getAllChartTypes()).not.toContain("treemap");
    expect(getAllChartTypes()).not.toContain("circle-packing");
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
  it("returns all 18 registered types", () => {
    const types = getAllChartTypes();
    expect(types).toHaveLength(18);
    for (const t of CHART_TYPES) {
      expect(types).toContain(t);
    }
  });
});

// ---------------------------------------------------------------------------
// getSelectableChartTypes (#1158) — the widget picker's list
// ---------------------------------------------------------------------------
describe("getSelectableChartTypes", () => {
  const DISABLED = ["choropleth", "radar"];

  const graphCapable = { type: "fixturedb", supportsGraphData: true };

  it("excludes disabled types for a connector", () => {
    const types = getSelectableChartTypes(graphCapable);
    expect(types).toContain("bar");
    for (const d of DISABLED) expect(types).not.toContain(d);
  });

  it("excludes disabled types for the no-connector fallback", () => {
    const types = getSelectableChartTypes();
    expect(types).toContain("bar");
    for (const d of DISABLED) expect(types).not.toContain(d);
  });

  it("keeps the current type visible when it is disabled (editing a legacy widget)", () => {
    const types = getSelectableChartTypes(graphCapable, "radar");
    expect(types).toContain("radar");
  });

  it("does not duplicate a current type that is already offered", () => {
    const types = getSelectableChartTypes(graphCapable, "bar");
    expect(types.filter((t) => t === "bar")).toHaveLength(1);
  });

  // #1902: a connector the app has never heard of is not "invalid" — it is the
  // case this whole epic exists for. It gets every chart its capabilities allow.
  it("offers charts to a connector the app has never heard of", () => {
    const types = getSelectableChartTypes({ type: "brand-new-thing" });
    expect(types).toContain("bar");
    expect(types).not.toContain("graph");
  });
});
