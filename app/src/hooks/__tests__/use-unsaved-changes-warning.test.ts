import { describe, it, expect, beforeEach } from "vitest";
import { useDashboardStore } from "../../stores/dashboard-store";

// Tests for the store-level hasUnsavedChanges logic that useUnsavedChangesWarning depends on.
// The hook itself is a thin React wrapper that:
//  1. subscribes to hasUnsavedChanges()
//  2. registers/unregisters beforeunload
//  3. intercepts pushState for in-app nav with ConfirmDialog
// Full browser integration (beforeunload, navigation interception) is covered by Playwright E2E.

function resetStore() {
  useDashboardStore.getState().reset();
}

describe("unsaved changes warning — store integration", () => {
  beforeEach(resetStore);

  it("hasUnsavedChanges is false before any layout is loaded", () => {
    expect(useDashboardStore.getState().hasUnsavedChanges()).toBe(false);
  });

  it("hasUnsavedChanges is false immediately after loading a layout", () => {
    const layout = {
      version: 2 as const,
      pages: [{ id: "p1", title: "Page 1", widgets: [], gridLayout: [] }],
    };
    useDashboardStore.getState().setLayout(layout);
    expect(useDashboardStore.getState().hasUnsavedChanges()).toBe(false);
  });

  it("hasUnsavedChanges is true after modifying the layout", () => {
    const layout = {
      version: 2 as const,
      pages: [{ id: "p1", title: "Page 1", widgets: [], gridLayout: [] }],
    };
    useDashboardStore.getState().setLayout(layout);
    useDashboardStore.getState().addPage();
    expect(useDashboardStore.getState().hasUnsavedChanges()).toBe(true);
  });

  it("hasUnsavedChanges returns false after markSaved", () => {
    const layout = {
      version: 2 as const,
      pages: [{ id: "p1", title: "Page 1", widgets: [], gridLayout: [] }],
    };
    useDashboardStore.getState().setLayout(layout);
    useDashboardStore.getState().addPage();
    useDashboardStore.getState().markSaved();
    expect(useDashboardStore.getState().hasUnsavedChanges()).toBe(false);
  });

  it("hasUnsavedChanges detects widget removal as a change", () => {
    const layout = {
      version: 2 as const,
      pages: [
        {
          id: "p1",
          title: "Page 1",
          widgets: [
            { id: "w1", chartType: "bar", connectionId: "c1", query: "q1" },
          ],
          gridLayout: [{ i: "w1", x: 0, y: 0, w: 4, h: 3 }],
        },
      ],
    };
    useDashboardStore.getState().setLayout(layout);
    useDashboardStore.getState().removeWidget("w1");
    expect(useDashboardStore.getState().hasUnsavedChanges()).toBe(true);
  });

  it("hasUnsavedChanges detects grid layout change as a change", () => {
    const layout = {
      version: 2 as const,
      pages: [
        {
          id: "p1",
          title: "Page 1",
          widgets: [],
          gridLayout: [{ i: "w1", x: 0, y: 0, w: 4, h: 3 }],
        },
      ],
    };
    useDashboardStore.getState().setLayout(layout);
    useDashboardStore.getState().updateGridLayout([
      { i: "w1", x: 0, y: 0, w: 6, h: 4 },
    ]);
    expect(useDashboardStore.getState().hasUnsavedChanges()).toBe(true);
  });

  it("hasUnsavedChanges detects widget update as a change", () => {
    const layout = {
      version: 2 as const,
      pages: [
        {
          id: "p1",
          title: "Page 1",
          widgets: [
            { id: "w1", chartType: "bar", connectionId: "c1", query: "q1" },
          ],
          gridLayout: [{ i: "w1", x: 0, y: 0, w: 4, h: 3 }],
        },
      ],
    };
    useDashboardStore.getState().setLayout(layout);
    useDashboardStore.getState().updateWidget("w1", { chartType: "line" });
    expect(useDashboardStore.getState().hasUnsavedChanges()).toBe(true);
  });

  it("hasUnsavedChanges detects page removal as a change", () => {
    const layout = {
      version: 2 as const,
      pages: [
        { id: "p1", title: "Page 1", widgets: [], gridLayout: [] },
        { id: "p2", title: "Page 2", widgets: [], gridLayout: [] },
      ],
    };
    useDashboardStore.getState().setLayout(layout);
    useDashboardStore.getState().removePage(1);
    expect(useDashboardStore.getState().hasUnsavedChanges()).toBe(true);
  });
});
