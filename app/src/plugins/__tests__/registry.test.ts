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

  // A chart runs on every connector, so its hint names the columns in words; a
  // query in one language is wrong for the others (#2066, as #2051 did for
  // validation messages). Keywords are matched in capitals, as queries write them.
  it("no built-in plugin's queryHint quotes a query", () => {
    const QUERY_SYNTAX =
      /\b(SELECT|FROM|GROUP BY|MATCH|RETURN|CREATE)\b|`|Example:/;
    const hints = pluginRegistry
      .getAll()
      .filter((p) => p.queryHint !== undefined);
    expect(hints.length).toBeGreaterThan(0);
    for (const { type, queryHint } of hints) {
      expect(queryHint, `${type} queryHint quotes a query`).not.toMatch(
        QUERY_SYNTAX,
      );
    }
  });

  // Form fields bind as $param_<name>, as the form fields editor shows.
  it("the form queryHint names the $param_ syntax form fields bind as", () => {
    expect(pluginRegistry.get("form")?.queryHint).toMatch(/\$param_/);
  });

  it("unknown chart types return undefined", () => {
    expect(pluginRegistry.get("nonexistent-chart-type")).toBeUndefined();
    expect(pluginRegistry.has("nonexistent-chart-type")).toBe(false);
  });
});
