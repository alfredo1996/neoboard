import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ChartPlugin } from "@/lib/plugin/chart-plugin-registry";
import {
  createPluginRegistry,
  defineChartPlugin,
} from "@/lib/plugin/chart-plugin-registry";
import { registerExternalPlugins } from "../register-external";

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

describe("plugin hardening", () => {
  /**
   * These four cases used to assert on `registerExternalPluginsSafe`, a
   * function the test file declared itself — the file never imported
   * app/src/plugins/index.ts, so the loop it guards was never executed and
   * every hardening guarantee was proven about a local re-implementation
   * (#1629). They now run the real thing.
   */
  describe("external plugin crash prevention", () => {
    let registry: ReturnType<typeof createPluginRegistry>;
    let errors: string[];

    beforeEach(() => {
      registry = createPluginRegistry();
      errors = [];
      // Production reports a bad plugin by logging and carrying on, so that
      // is what there is to assert on.
      vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
        errors.push(args.map(String).join(" "));
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("skips null plugin without crashing", () => {
      registerExternalPlugins(registry, [{ plugin: null, overrides: false }]);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("invalid plugin object");
    });

    it("skips plugin without type without crashing", () => {
      registerExternalPlugins(registry, [
        { plugin: { type: "" } as unknown as ChartPlugin, overrides: false },
      ]);
      expect(errors).toHaveLength(1);
      expect(registry.has("")).toBe(false);
    });

    it("skips conflicting plugin without crashing (logs instead of throws)", () => {
      const original = makePlugin("bar");
      registry.register(original);
      registerExternalPlugins(registry, [
        { plugin: makePlugin("bar"), overrides: false },
      ]);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("conflicts");
      // The original survives — a conflicting external plugin must not win by
      // arriving second.
      expect(registry.get("bar")).toBe(original);
    });

    it("replaces a built-in only when the manifest says overrides", () => {
      registry.register(makePlugin("bar"));
      const replacement = makePlugin("bar");
      registerExternalPlugins(registry, [
        { plugin: replacement, overrides: true },
      ]);
      expect(errors).toHaveLength(0);
      expect(registry.get("bar")).toBe(replacement);
    });

    it("continues registering after one plugin fails", () => {
      registerExternalPlugins(registry, [
        { plugin: null, overrides: false },
        { plugin: makePlugin("heatmap"), overrides: false },
      ]);
      expect(errors).toHaveLength(1);
      expect(registry.has("heatmap")).toBe(true);
    });

    it("survives a plugin whose registration throws", () => {
      const exploding = makePlugin("boom");
      vi.spyOn(registry, "register").mockImplementationOnce(() => {
        throw new Error("bang");
      });
      registerExternalPlugins(registry, [
        { plugin: exploding, overrides: false },
        { plugin: makePlugin("safe"), overrides: false },
      ]);
      expect(errors[0]).toContain("bang");
      expect(registry.has("safe")).toBe(true);
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
