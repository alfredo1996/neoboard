import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ChartPlugin } from "@/lib/plugin/chart-plugin-registry";
import { createPluginRegistry } from "@/lib/plugin/chart-plugin-registry";

// Lightweight plugin factory for tests — ONLY fields the bootstrap cares
// about. Full plugin coverage lives in bar.test.tsx and friends.
function makePlugin(type: string): ChartPlugin {
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
  };
}

/**
 * Mirrors the external-plugin registration loop in plugins/index.ts.
 * Keeping the decision here lets us unit-test it without executing the
 * full bootstrap side effect.
 */
function registerExternalPlugins(
  registry: ReturnType<typeof createPluginRegistry>,
  entries: Array<{ plugin: ChartPlugin; overrides: boolean }>,
) {
  for (const { plugin, overrides } of entries) {
    if (registry.has(plugin.type)) {
      if (!overrides) {
        throw new Error(
          `External plugin "${plugin.type}" conflicts with an existing plugin. ` +
            `Set "overrides": true in neoboard-plugins.json to replace the built-in.`,
        );
      }
      registry.unregister(plugin.type);
    }
    registry.register(plugin);
  }
}

describe("external plugin bootstrap — overrides logic", () => {
  let registry: ReturnType<typeof createPluginRegistry>;

  beforeEach(() => {
    registry = createPluginRegistry();
  });

  it("registers an external plugin with a unique type", () => {
    registerExternalPlugins(registry, [
      { plugin: makePlugin("heatmap"), overrides: false },
    ]);
    expect(registry.has("heatmap")).toBe(true);
  });

  it("rejects an external plugin that conflicts with a built-in when overrides=false", () => {
    registry.register(makePlugin("bar"));
    expect(() =>
      registerExternalPlugins(registry, [
        { plugin: makePlugin("bar"), overrides: false },
      ]),
    ).toThrow(/conflicts with an existing plugin/);
    expect(() =>
      registerExternalPlugins(registry, [
        { plugin: makePlugin("bar"), overrides: false },
      ]),
    ).toThrow(/overrides.*true/);
  });

  it("replaces a built-in when overrides=true", () => {
    const builtin = makePlugin("bar");
    builtin.label = "Built-in Bar";
    registry.register(builtin);

    const external = makePlugin("bar");
    external.label = "External Bar";
    registerExternalPlugins(registry, [{ plugin: external, overrides: true }]);

    expect(registry.get("bar")?.label).toBe("External Bar");
  });

  it("registers multiple external plugins in order", () => {
    registerExternalPlugins(registry, [
      { plugin: makePlugin("heatmap"), overrides: false },
      { plugin: makePlugin("funnel"), overrides: false },
    ]);
    expect(registry.getTypes()).toEqual(
      expect.arrayContaining(["heatmap", "funnel"]),
    );
  });

  it("first conflict aborts the batch — subsequent entries are not registered", () => {
    registry.register(makePlugin("bar"));
    expect(() =>
      registerExternalPlugins(registry, [
        { plugin: makePlugin("bar"), overrides: false },
        { plugin: makePlugin("safe"), overrides: false },
      ]),
    ).toThrow();
    // "safe" never got registered because the loop threw on "bar"
    expect(registry.has("safe")).toBe(false);
  });

  it("empty entries array is a no-op", () => {
    const before = registry.getTypes().length;
    registerExternalPlugins(registry, []);
    expect(registry.getTypes().length).toBe(before);
  });
});

describe("plugin bootstrap — end-to-end (real registry)", () => {
  it("exports pluginRegistry with built-ins registered", async () => {
    // Mock the heavy component-library dep so the bootstrap doesn't
    // load the full chart suite in the test env.
    vi.doMock("@neoboard/components", () => ({
      MarkdownWidget: () => null,
      getChartOptions: () => [],
    }));
    const { pluginRegistry } = await import("../index");
    expect(pluginRegistry.has("bar")).toBe(true);
    expect(pluginRegistry.has("markdown")).toBe(true);
    vi.doUnmock("@neoboard/components");
  });
});
