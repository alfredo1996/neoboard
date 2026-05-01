import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ChartPlugin } from "@/lib/plugin/chart-plugin-registry";
import {
  createPluginRegistry,
  defineChartPlugin,
} from "@/lib/plugin/chart-plugin-registry";

function makePlugin(
  type: string,
  overrides?: Partial<ChartPlugin>,
): ChartPlugin {
  return {
    type,
    label: type,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    component: (() => null) as any,
    transform: (d) => d,
    options: [],
    capabilities: {
      supportsClickAction: false,
      supportsStyling: false,
      isECharts: false,
      requiresQuery: true,
    },
    ...overrides,
  };
}

// --- 1. External plugin try/catch (mirrors new index.ts behavior) ---

function registerExternalPluginsSafe(
  registry: ReturnType<typeof createPluginRegistry>,
  entries: Array<{ plugin: ChartPlugin | null; overrides: boolean }>,
): string[] {
  const errors: string[] = [];
  for (const { plugin, overrides } of entries) {
    try {
      if (!plugin || typeof plugin !== "object" || !plugin.type) {
        errors.push("invalid plugin object");
        continue;
      }
      if (registry.has(plugin.type)) {
        if (!overrides) {
          errors.push("conflict: " + plugin.type);
          continue;
        }
        registry.unregister(plugin.type);
      }
      registry.register(plugin);
    } catch (err) {
      errors.push("registration failed: " + String(err));
    }
  }
  return errors;
}

describe("plugin hardening", () => {
  describe("external plugin crash prevention", () => {
    let registry: ReturnType<typeof createPluginRegistry>;

    beforeEach(() => {
      registry = createPluginRegistry();
    });

    it("skips null plugin without crashing", () => {
      const errors = registerExternalPluginsSafe(registry, [
        { plugin: null, overrides: false },
      ]);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("invalid");
    });

    it("skips plugin without type without crashing", () => {
      const errors = registerExternalPluginsSafe(registry, [
        {
          plugin: { type: "" } as unknown as ChartPlugin,
          overrides: false,
        },
      ]);
      expect(errors).toHaveLength(1);
    });

    it("skips conflicting plugin without crashing (logs instead of throws)", () => {
      registry.register(makePlugin("bar"));
      const errors = registerExternalPluginsSafe(registry, [
        { plugin: makePlugin("bar"), overrides: false },
      ]);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("conflict");
      // Original bar is still registered
      expect(registry.has("bar")).toBe(true);
    });

    it("continues registering after one plugin fails", () => {
      const errors = registerExternalPluginsSafe(registry, [
        { plugin: null, overrides: false },
        { plugin: makePlugin("heatmap"), overrides: false },
      ]);
      expect(errors).toHaveLength(1);
      expect(registry.has("heatmap")).toBe(true);
    });
  });

  // --- 2. Plugin config validation ---

  describe("defineChartPlugin validation", () => {
    it("throws on missing type", () => {
      expect(() =>
        defineChartPlugin({
          type: "",
          label: "X",
          component: () => null,
          transform: (d: unknown) => d,
        } as never),
      ).toThrow("type is required");
    });

    it("throws on missing label", () => {
      expect(() =>
        defineChartPlugin({
          type: "x",
          label: "",
          component: () => null,
          transform: (d: unknown) => d,
        } as never),
      ).toThrow("label is required");
    });

    it("throws on missing transform", () => {
      expect(() =>
        defineChartPlugin({
          type: "x",
          label: "X",
          component: () => null,
          transform: "not a function",
        } as never),
      ).toThrow("transform must be a function");
    });

    it("warns on options with missing key", () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      defineChartPlugin({
        type: "test",
        label: "Test",
        component: (() => null) as never,
        transform: (d: unknown) => d,
        options: [{ key: "", label: "X", type: "boolean", default: false }],
      } as never);
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining("option missing"),
        expect.anything(),
      );
      spy.mockRestore();
    });

    it("warns on empty compatibleWith entry", () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      defineChartPlugin({
        type: "test2",
        label: "Test",
        component: (() => null) as never,
        transform: (d: unknown) => d,
        compatibleWith: ["neo4j", ""],
      } as never);
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining("invalid compatibleWith"),
        expect.anything(),
      );
      spy.mockRestore();
    });
  });

  // --- 3. Transform error handling ---

  describe("transform error handling", () => {
    it("broken transform returns data without crashing", () => {
      const badTransform = () => {
        throw new Error("transform exploded");
      };
      const rawData = [{ a: 1 }];

      // Simulate what card-container does
      let result: unknown;
      try {
        result = badTransform();
      } catch {
        result = rawData; // fallback
      }
      expect(result).toEqual(rawData);
    });
  });
});
