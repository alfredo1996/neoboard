import { describe, it, expect } from "vitest";
import {
  getWidgetDisplayTitle,
  isWidgetTemplateOutdated,
} from "@/lib/widget/widget-utils";
import type { DashboardWidget } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Helper to build a minimal DashboardWidget
// ---------------------------------------------------------------------------
function makeWidget(overrides: Partial<DashboardWidget> = {}): DashboardWidget {
  return {
    id: "w1",
    chartType: "bar",
    connectionId: "c1",
    query: "SELECT 1",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getWidgetDisplayTitle
// ---------------------------------------------------------------------------
describe("getWidgetDisplayTitle", () => {
  it("returns title from widget settings", () => {
    const widget = makeWidget({ settings: { title: "Revenue Chart" } });
    expect(getWidgetDisplayTitle(widget)).toBe("Revenue Chart");
  });

  it("returns chart label when no title setting", () => {
    const widget = makeWidget({ chartType: "pie" });
    expect(getWidgetDisplayTitle(widget)).toBe("Pie Chart");
  });

  it("returns chart label when title is not a string", () => {
    const widget = makeWidget({ settings: { title: 42 } });
    // 42 is truthy but not a string, should fall back to chart label
    expect(getWidgetDisplayTitle(widget)).toBe("Bar Chart");
  });

  it("returns chartType as-is for unknown chart type", () => {
    const widget = makeWidget({ chartType: "unknown-type" });
    expect(getWidgetDisplayTitle(widget)).toBe("unknown-type");
  });

  // ── #1519 ────────────────────────────────────────────────────────────────
  // The chart-label fallback is useful for a data widget — an untitled bar
  // chart labelled "Bar Chart" tells you something. For a content widget the
  // prose IS the heading, so the fallback announced the implementation type:
  // 70 of the 78 markdown widgets in the shipped demo were headed "Markdown".

  it("returns no title for an untitled markdown widget", () => {
    const widget = makeWidget({ chartType: "markdown" });
    expect(getWidgetDisplayTitle(widget)).toBe("");
  });

  it("returns no title for an untitled iframe widget", () => {
    const widget = makeWidget({ chartType: "iframe" });
    expect(getWidgetDisplayTitle(widget)).toBe("");
  });

  it("still returns an author's title on a content widget", () => {
    const widget = makeWidget({
      chartType: "markdown",
      settings: { title: "How this works" },
    });
    expect(getWidgetDisplayTitle(widget)).toBe("How this works");
  });

  // A whitespace-only title is not a title — it rendered a blank header taking
  // vertical space with nothing in it.
  it("treats a whitespace-only title as absent", () => {
    expect(
      getWidgetDisplayTitle(
        makeWidget({ chartType: "markdown", settings: { title: "   " } }),
      ),
    ).toBe("");
    expect(
      getWidgetDisplayTitle(
        makeWidget({ chartType: "bar", settings: { title: "   " } }),
      ),
    ).toBe("Bar Chart");
  });

  it("keeps the label fallback for every data-driven type", () => {
    for (const [chartType, expected] of [
      ["bar", "Bar Chart"],
      ["pie", "Pie Chart"],
    ] as const) {
      expect(getWidgetDisplayTitle(makeWidget({ chartType }))).toBe(expected);
    }
  });
});

// ---------------------------------------------------------------------------
// isWidgetTemplateOutdated
// ---------------------------------------------------------------------------
describe("isWidgetTemplateOutdated", () => {
  it("returns false when widget has no templateId", () => {
    const widget = makeWidget();
    expect(isWidgetTemplateOutdated(widget, {})).toBe(false);
  });

  it("returns false when widget has no templateSyncedAt", () => {
    const widget = makeWidget({ templateId: "t1" });
    expect(
      isWidgetTemplateOutdated(widget, { t1: { updatedAt: "2025-01-01" } }),
    ).toBe(false);
  });

  it("returns false when template is not in the map", () => {
    const widget = makeWidget({
      templateId: "t1",
      templateSyncedAt: "2025-01-01T00:00:00Z",
    });
    expect(isWidgetTemplateOutdated(widget, {})).toBe(false);
    expect(isWidgetTemplateOutdated(widget, undefined)).toBe(false);
  });

  it("returns true when template was updated after sync", () => {
    const widget = makeWidget({
      templateId: "t1",
      templateSyncedAt: "2025-01-01T00:00:00Z",
    });
    const templateMap = { t1: { updatedAt: "2025-06-15T00:00:00Z" } };
    expect(isWidgetTemplateOutdated(widget, templateMap)).toBe(true);
  });

  it("returns false when template was updated before sync", () => {
    const widget = makeWidget({
      templateId: "t1",
      templateSyncedAt: "2025-06-15T00:00:00Z",
    });
    const templateMap = { t1: { updatedAt: "2025-01-01T00:00:00Z" } };
    expect(isWidgetTemplateOutdated(widget, templateMap)).toBe(false);
  });
});
