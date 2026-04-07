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
