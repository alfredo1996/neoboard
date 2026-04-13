import { describe, it, expect, beforeEach } from "vitest";
import {
  defineChartPlugin,
  createPluginRegistry,
  type ChartPlugin,
} from "@/lib/plugin/chart-plugin-registry";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fakeComponent = () => null;

const makePlugin = (overrides: Partial<ChartPlugin> = {}): ChartPlugin =>
  defineChartPlugin({
    type: "bar",
    label: "Bar Chart",
    component: fakeComponent,
    transform: (rows) => rows,
    ...overrides,
  });

// ---------------------------------------------------------------------------
// defineChartPlugin — config normalization
// ---------------------------------------------------------------------------

describe("defineChartPlugin", () => {
  it("creates a plugin with minimal required fields", () => {
    const plugin = defineChartPlugin({
      type: "bar",
      label: "Bar Chart",
      component: fakeComponent,
      transform: (rows) => rows,
    });
    expect(plugin.type).toBe("bar");
    expect(plugin.label).toBe("Bar Chart");
    expect(plugin.component).toBe(fakeComponent);
  });

  it("applies sensible defaults to capabilities", () => {
    const plugin = makePlugin();
    expect(plugin.capabilities.supportsClickAction).toBe(true);
    expect(plugin.capabilities.supportsStyling).toBe(false);
    expect(plugin.capabilities.requiresQuery).toBe(true);
    expect(plugin.capabilities.isECharts).toBe(false);
  });

  it("enables supportsStyling when stylingTargets is provided", () => {
    const plugin = makePlugin({
      stylingTargets: [{ value: "color", label: "Color" }],
    });
    expect(plugin.capabilities.supportsStyling).toBe(true);
  });

  it("allows explicit capability overrides", () => {
    const plugin = makePlugin({
      capabilities: {
        supportsClickAction: false,
        requiresQuery: false,
        supportsStyling: false,
        isECharts: false,
      },
    });
    expect(plugin.capabilities.supportsClickAction).toBe(false);
    expect(plugin.capabilities.requiresQuery).toBe(false);
  });

  it("preserves options when provided", () => {
    const plugin = makePlugin({
      options: [
        {
          key: "stacked",
          label: "Stacked",
          type: "boolean",
          default: false,
          category: "Layout",
        },
      ],
    });
    expect(plugin.options).toHaveLength(1);
    expect(plugin.options?.[0].key).toBe("stacked");
  });

  it("defaults options to empty array when not provided", () => {
    const plugin = makePlugin();
    expect(plugin.options).toEqual([]);
  });

  it("preserves compatibleWith list", () => {
    const plugin = makePlugin({ compatibleWith: ["neo4j"] });
    expect(plugin.compatibleWith).toEqual(["neo4j"]);
  });

  it("preserves queryHint", () => {
    const plugin = makePlugin({ queryHint: "Return label, value" });
    expect(plugin.queryHint).toBe("Return label, value");
  });
});

// ---------------------------------------------------------------------------
// Registry — register / lookup
// ---------------------------------------------------------------------------

describe("createPluginRegistry", () => {
  let registry: ReturnType<typeof createPluginRegistry>;

  beforeEach(() => {
    registry = createPluginRegistry();
  });

  it("registers a plugin and retrieves it by type", () => {
    const plugin = makePlugin({ type: "bar" });
    registry.register(plugin);
    expect(registry.get("bar")).toBe(plugin);
  });

  it("returns undefined for unknown type", () => {
    expect(registry.get("unknown-chart")).toBeUndefined();
  });

  it("throws on duplicate registration of same type", () => {
    registry.register(makePlugin({ type: "bar" }));
    expect(() => registry.register(makePlugin({ type: "bar" }))).toThrow(
      /already registered/i,
    );
  });

  it("allows multiple distinct plugins", () => {
    registry.register(makePlugin({ type: "bar", label: "Bar" }));
    registry.register(makePlugin({ type: "line", label: "Line" }));
    registry.register(makePlugin({ type: "pie", label: "Pie" }));
    expect(registry.getAll()).toHaveLength(3);
  });

  it("lists all registered plugins in registration order", () => {
    registry.register(makePlugin({ type: "bar" }));
    registry.register(makePlugin({ type: "line" }));
    const all = registry.getAll();
    expect(all.map((p) => p.type)).toEqual(["bar", "line"]);
  });

  it("has() returns true for registered types", () => {
    registry.register(makePlugin({ type: "bar" }));
    expect(registry.has("bar")).toBe(true);
    expect(registry.has("line")).toBe(false);
  });

  it("getTypes() returns all registered type names", () => {
    registry.register(makePlugin({ type: "bar" }));
    registry.register(makePlugin({ type: "pie" }));
    expect(registry.getTypes()).toEqual(["bar", "pie"]);
  });

  it("unregister() removes a plugin", () => {
    registry.register(makePlugin({ type: "bar" }));
    registry.unregister("bar");
    expect(registry.get("bar")).toBeUndefined();
    expect(registry.has("bar")).toBe(false);
  });

  it("unregister() is safe on unknown types", () => {
    expect(() => registry.unregister("nope")).not.toThrow();
  });

  it("filters plugins by compatible connector type", () => {
    registry.register(makePlugin({ type: "graph", compatibleWith: ["neo4j"] }));
    registry.register(
      makePlugin({ type: "bar", compatibleWith: ["neo4j", "postgresql"] }),
    );
    registry.register(makePlugin({ type: "pie" })); // no compatibleWith = all

    const neo4jPlugins = registry.getCompatibleWith("neo4j");
    expect(neo4jPlugins.map((p) => p.type).sort()).toEqual([
      "bar",
      "graph",
      "pie",
    ]);

    const pgPlugins = registry.getCompatibleWith("postgresql");
    expect(pgPlugins.map((p) => p.type).sort()).toEqual(["bar", "pie"]);
  });
});

// ---------------------------------------------------------------------------
// Validation — defineChartPlugin guards invalid configs
// ---------------------------------------------------------------------------

describe("defineChartPlugin validation", () => {
  it("throws when type is empty", () => {
    expect(() =>
      defineChartPlugin({
        type: "",
        label: "Empty",
        component: fakeComponent,
        transform: (r) => r,
      }),
    ).toThrow(/type.*required/i);
  });

  it("throws when label is empty", () => {
    expect(() =>
      defineChartPlugin({
        type: "bar",
        label: "",
        component: fakeComponent,
        transform: (r) => r,
      }),
    ).toThrow(/label.*required/i);
  });

  it("throws when transform is not a function", () => {
    expect(() =>
      defineChartPlugin({
        type: "bar",
        label: "Bar",
        component: fakeComponent,
        // @ts-expect-error -- deliberately invalid
        transform: "not a function",
      }),
    ).toThrow(/transform.*function/i);
  });
});
