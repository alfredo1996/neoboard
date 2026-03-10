import { describe, it, expect } from "vitest";
import type { DashboardWidget } from "@/lib/db/schema";

/**
 * Pure helper that mirrors the isWidgetOutdated logic in DashboardContainer.
 * Extracted here so it can be unit-tested without rendering the component.
 */
function isWidgetOutdated(
  widget: DashboardWidget,
  templateMap: Record<string, { updatedAt?: Date | null }>
): boolean {
  if (!widget.templateId || !widget.templateSyncedAt) return false;
  const tmpl = templateMap[widget.templateId];
  if (!tmpl?.updatedAt) return false;
  return new Date(tmpl.updatedAt) > new Date(widget.templateSyncedAt);
}

describe("isWidgetOutdated", () => {
  const syncedAt = "2025-01-01T00:00:00.000Z";

  it("returns false when widget has no templateId", () => {
    const widget: DashboardWidget = {
      id: "w1", chartType: "bar", connectionId: "c1", query: "q",
    };
    expect(isWidgetOutdated(widget, {})).toBe(false);
  });

  it("returns false when widget has no templateSyncedAt", () => {
    const widget: DashboardWidget = {
      id: "w1", chartType: "bar", connectionId: "c1", query: "q",
      templateId: "tmpl-1",
    };
    expect(isWidgetOutdated(widget, { "tmpl-1": { updatedAt: new Date() } })).toBe(false);
  });

  it("returns false when template is not in the map (deleted)", () => {
    const widget: DashboardWidget = {
      id: "w1", chartType: "bar", connectionId: "c1", query: "q",
      templateId: "tmpl-deleted",
      templateSyncedAt: syncedAt,
    };
    expect(isWidgetOutdated(widget, {})).toBe(false);
  });

  it("returns false when template has no updatedAt", () => {
    const widget: DashboardWidget = {
      id: "w1", chartType: "bar", connectionId: "c1", query: "q",
      templateId: "tmpl-1",
      templateSyncedAt: syncedAt,
    };
    expect(isWidgetOutdated(widget, { "tmpl-1": { updatedAt: null } })).toBe(false);
  });

  it("returns false when template updatedAt equals templateSyncedAt (up to date)", () => {
    const widget: DashboardWidget = {
      id: "w1", chartType: "bar", connectionId: "c1", query: "q",
      templateId: "tmpl-1",
      templateSyncedAt: syncedAt,
    };
    expect(isWidgetOutdated(widget, { "tmpl-1": { updatedAt: new Date(syncedAt) } })).toBe(false);
  });

  it("returns false when template updatedAt is older than templateSyncedAt", () => {
    const widget: DashboardWidget = {
      id: "w1", chartType: "bar", connectionId: "c1", query: "q",
      templateId: "tmpl-1",
      templateSyncedAt: "2025-06-01T00:00:00.000Z",
    };
    expect(isWidgetOutdated(widget, { "tmpl-1": { updatedAt: new Date("2025-01-01") } })).toBe(false);
  });

  it("returns true when template updatedAt is newer than templateSyncedAt", () => {
    const widget: DashboardWidget = {
      id: "w1", chartType: "bar", connectionId: "c1", query: "q",
      templateId: "tmpl-1",
      templateSyncedAt: syncedAt,
    };
    expect(isWidgetOutdated(widget, { "tmpl-1": { updatedAt: new Date("2025-06-01") } })).toBe(true);
  });
});
