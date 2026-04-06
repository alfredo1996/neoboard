import { describe, it, expect, vi } from "vitest";

vi.mock("@neoboard/components", () => ({
  MarkdownWidget: () => null,
}));

// Import the global registry via the plugin index (this also triggers
// registration side effects for all built-in plugins).
import { pluginRegistry } from "../index";

describe("global plugin registry (bootstrap)", () => {
  it("has markdown plugin registered on import", () => {
    expect(pluginRegistry.has("markdown")).toBe(true);
    const plugin = pluginRegistry.get("markdown");
    expect(plugin?.type).toBe("markdown");
    expect(plugin?.label).toBe("Markdown");
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
