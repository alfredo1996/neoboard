import { describe, it, expect, vi } from "vitest";

vi.mock("@neoboard/components", () => ({
  MarkdownWidget: () => null,
  getChartOptions: () => [],
}));

// Import the global registry via the plugin index (this also triggers
// registration side effects for all built-in plugins). Keep it a static
// import: the plugin graph is ~120 modules, and loading it at file level
// keeps that cost out of every test's 5 s timeout. Loaded inside an `it`
// body, it times out whenever the machine is busy.
import { pluginRegistry } from "../index";
import { barPlugin } from "../bar";
import { markdownPlugin } from "../markdown";

describe("global plugin registry (bootstrap)", () => {
  it("has markdown plugin registered on import", () => {
    expect(pluginRegistry.has("markdown")).toBe(true);
    const plugin = pluginRegistry.get("markdown");
    expect(plugin?.type).toBe("markdown");
    expect(plugin?.label).toBe("Markdown");
  });

  it("registers the real built-ins, not the chart-helpers stubs", () => {
    // chart-helpers pre-registers a stub under each type with the same
    // label, so has("bar") passes even if index.ts drops barPlugin.
    expect(pluginRegistry.get("bar")).toBe(barPlugin);
    expect(pluginRegistry.get("markdown")).toBe(markdownPlugin);
  });

  it("re-importing plugins/index.ts is idempotent", async () => {
    // Re-importing should NOT throw about duplicate registration.
    const mod = await import("../index");
    expect(mod.pluginRegistry.has("markdown")).toBe(true);
  });

  it("unknown chart types return undefined", () => {
    expect(pluginRegistry.get("nonexistent-chart-type")).toBeUndefined();
    expect(pluginRegistry.has("nonexistent-chart-type")).toBe(false);
  });
});
