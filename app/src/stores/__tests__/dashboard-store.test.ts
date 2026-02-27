import { describe, it, expect, beforeEach } from "vitest";
import { useDashboardStore } from "../dashboard-store";

// Reset the Zustand store before each test
function resetStore() {
  useDashboardStore.getState().reset();
}

describe("useDashboardStore", () => {
  beforeEach(resetStore);

  // ── Initial state ──────────────────────────────────────────────────

  it("starts with version-2 layout containing one page", () => {
    const { layout, activePageIndex, editMode } = useDashboardStore.getState();
    expect(layout.version).toBe(2);
    expect(layout.pages).toHaveLength(1);
    expect(layout.pages[0].title).toBe("Page 1");
    expect(activePageIndex).toBe(0);
    expect(editMode).toBe(false);
  });

  // ── setLayout ─────────────────────────────────────────────────────

  it("setLayout replaces the layout and resets activePageIndex to 0 by default", () => {
    const newLayout = {
      version: 2 as const,
      pages: [
        { id: "p1", title: "A", widgets: [], gridLayout: [] },
        { id: "p2", title: "B", widgets: [], gridLayout: [] },
      ],
    };
    useDashboardStore.getState().setLayout(newLayout);
    const state = useDashboardStore.getState();
    expect(state.layout).toEqual(newLayout);
    expect(state.activePageIndex).toBe(0);
  });

  it("setLayout with initialPageIndex=2 sets activePageIndex to 2", () => {
    const newLayout = {
      version: 2 as const,
      pages: [
        { id: "p1", title: "A", widgets: [], gridLayout: [] },
        { id: "p2", title: "B", widgets: [], gridLayout: [] },
        { id: "p3", title: "C", widgets: [], gridLayout: [] },
      ],
    };
    useDashboardStore.getState().setLayout(newLayout, 2);
    expect(useDashboardStore.getState().activePageIndex).toBe(2);
  });

  it("setLayout clamps initialPageIndex to last valid index when out of bounds", () => {
    const newLayout = {
      version: 2 as const,
      pages: [
        { id: "p1", title: "A", widgets: [], gridLayout: [] },
        { id: "p2", title: "B", widgets: [], gridLayout: [] },
      ],
    };
    useDashboardStore.getState().setLayout(newLayout, 99);
    expect(useDashboardStore.getState().activePageIndex).toBe(1);
  });

  it("setLayout with initialPageIndex=0 behaves like the default (no-arg) case", () => {
    const newLayout = {
      version: 2 as const,
      pages: [
        { id: "p1", title: "A", widgets: [], gridLayout: [] },
        { id: "p2", title: "B", widgets: [], gridLayout: [] },
      ],
    };
    useDashboardStore.getState().setLayout(newLayout, 0);
    expect(useDashboardStore.getState().activePageIndex).toBe(0);
  });

  // ── setEditMode ───────────────────────────────────────────────────

  it("setEditMode(true) enables edit mode", () => {
    useDashboardStore.getState().setEditMode(true);
    expect(useDashboardStore.getState().editMode).toBe(true);
  });

  it("setEditMode(false) disables edit mode", () => {
    useDashboardStore.getState().setEditMode(true);
    useDashboardStore.getState().setEditMode(false);
    expect(useDashboardStore.getState().editMode).toBe(false);
  });

  // ── reset ─────────────────────────────────────────────────────────

  it("reset restores the initial state after modifications", () => {
    useDashboardStore.getState().addPage();
    useDashboardStore.getState().setEditMode(true);
    useDashboardStore.getState().reset();
    const state = useDashboardStore.getState();
    expect(state.layout.pages).toHaveLength(1);
    expect(state.editMode).toBe(false);
    expect(state.activePageIndex).toBe(0);
  });

  // ── setActivePage ─────────────────────────────────────────────────

  it("setActivePage changes the active page index", () => {
    useDashboardStore.getState().addPage();
    useDashboardStore.getState().setActivePage(1);
    expect(useDashboardStore.getState().activePageIndex).toBe(1);
  });

  // ── addPage ───────────────────────────────────────────────────────

  it("addPage appends a new page and activates it", () => {
    useDashboardStore.getState().addPage();
    const state = useDashboardStore.getState();
    expect(state.layout.pages).toHaveLength(2);
    expect(state.activePageIndex).toBe(1);
    expect(state.layout.pages[1].title).toBe("Page 2");
    expect(state.layout.pages[1].widgets).toHaveLength(0);
    expect(state.layout.pages[1].gridLayout).toHaveLength(0);
  });

  it("addPage increments page number based on total count", () => {
    useDashboardStore.getState().addPage();
    useDashboardStore.getState().addPage();
    expect(useDashboardStore.getState().layout.pages[2].title).toBe("Page 3");
  });

  // ── removePage ────────────────────────────────────────────────────

  it("removePage removes the page at the given index", () => {
    useDashboardStore.getState().addPage();
    useDashboardStore.getState().removePage(0);
    const state = useDashboardStore.getState();
    expect(state.layout.pages).toHaveLength(1);
  });

  it("removePage adjusts activePageIndex so it stays in range", () => {
    useDashboardStore.getState().addPage();
    useDashboardStore.getState().setActivePage(1);
    useDashboardStore.getState().removePage(1);
    expect(useDashboardStore.getState().activePageIndex).toBe(0);
  });

  it("removePage is a no-op when only one page remains", () => {
    useDashboardStore.getState().removePage(0);
    expect(useDashboardStore.getState().layout.pages).toHaveLength(1);
  });

  // ── renamePage ────────────────────────────────────────────────────

  it("renamePage updates the title of the specified page", () => {
    useDashboardStore.getState().renamePage(0, "Renamed");
    expect(useDashboardStore.getState().layout.pages[0].title).toBe("Renamed");
  });

  it("renamePage only affects the target page", () => {
    useDashboardStore.getState().addPage();
    useDashboardStore.getState().renamePage(0, "First");
    const pages = useDashboardStore.getState().layout.pages;
    expect(pages[0].title).toBe("First");
    expect(pages[1].title).toBe("Page 2");
  });

  // ── addWidget ─────────────────────────────────────────────────────

  it("addWidget adds the widget and grid item to the active page", () => {
    const widget = { id: "w1", chartType: "bar", connectionId: "c1", query: "MATCH (n) RETURN n" };
    const gridItem = { i: "w1", x: 0, y: 0, w: 4, h: 3 };
    useDashboardStore.getState().addWidget(widget, gridItem);
    const page = useDashboardStore.getState().layout.pages[0];
    expect(page.widgets).toHaveLength(1);
    expect(page.widgets[0]).toEqual(widget);
    expect(page.gridLayout).toHaveLength(1);
    expect(page.gridLayout[0]).toEqual(gridItem);
  });

  it("addWidget targets the currently active page", () => {
    useDashboardStore.getState().addPage();
    useDashboardStore.getState().setActivePage(1);
    const widget = { id: "w2", chartType: "line", connectionId: "c1", query: "q" };
    const gridItem = { i: "w2", x: 0, y: 0, w: 2, h: 2 };
    useDashboardStore.getState().addWidget(widget, gridItem);
    expect(useDashboardStore.getState().layout.pages[0].widgets).toHaveLength(0);
    expect(useDashboardStore.getState().layout.pages[1].widgets).toHaveLength(1);
  });

  // ── removeWidget ──────────────────────────────────────────────────

  it("removeWidget removes widget and grid item by id", () => {
    const widget = { id: "w1", chartType: "bar", connectionId: "c1", query: "q" };
    const gridItem = { i: "w1", x: 0, y: 0, w: 4, h: 3 };
    useDashboardStore.getState().addWidget(widget, gridItem);
    useDashboardStore.getState().removeWidget("w1");
    const page = useDashboardStore.getState().layout.pages[0];
    expect(page.widgets).toHaveLength(0);
    expect(page.gridLayout).toHaveLength(0);
  });

  it("removeWidget does not affect other widgets", () => {
    const w1 = { id: "w1", chartType: "bar", connectionId: "c1", query: "q1" };
    const w2 = { id: "w2", chartType: "line", connectionId: "c1", query: "q2" };
    useDashboardStore.getState().addWidget(w1, { i: "w1", x: 0, y: 0, w: 4, h: 3 });
    useDashboardStore.getState().addWidget(w2, { i: "w2", x: 4, y: 0, w: 4, h: 3 });
    useDashboardStore.getState().removeWidget("w1");
    const page = useDashboardStore.getState().layout.pages[0];
    expect(page.widgets).toHaveLength(1);
    expect(page.widgets[0].id).toBe("w2");
  });

  // ── updateWidget ──────────────────────────────────────────────────

  it("updateWidget merges partial updates into the existing widget", () => {
    const widget = { id: "w1", chartType: "bar", connectionId: "c1", query: "q" };
    useDashboardStore.getState().addWidget(widget, { i: "w1", x: 0, y: 0, w: 4, h: 3 });
    useDashboardStore.getState().updateWidget("w1", { chartType: "line" });
    const updated = useDashboardStore.getState().layout.pages[0].widgets[0];
    expect(updated.chartType).toBe("line");
    expect(updated.query).toBe("q");
  });

  it("updateWidget does not affect other widgets", () => {
    const w1 = { id: "w1", chartType: "bar", connectionId: "c1", query: "q1" };
    const w2 = { id: "w2", chartType: "pie", connectionId: "c1", query: "q2" };
    useDashboardStore.getState().addWidget(w1, { i: "w1", x: 0, y: 0, w: 4, h: 3 });
    useDashboardStore.getState().addWidget(w2, { i: "w2", x: 0, y: 3, w: 4, h: 3 });
    useDashboardStore.getState().updateWidget("w1", { chartType: "line" });
    expect(useDashboardStore.getState().layout.pages[0].widgets[1].chartType).toBe("pie");
  });

  // ── updateGridLayout ──────────────────────────────────────────────

  it("updateGridLayout replaces the grid layout on the active page", () => {
    const newGrid = [{ i: "w2", x: 0, y: 0, w: 6, h: 4 }];
    useDashboardStore.getState().updateGridLayout(newGrid);
    expect(useDashboardStore.getState().layout.pages[0].gridLayout).toEqual(newGrid);
  });

  it("updateGridLayout only updates the active page", () => {
    useDashboardStore.getState().addPage();
    useDashboardStore.getState().setActivePage(0);
    const newGrid = [{ i: "w1", x: 0, y: 0, w: 3, h: 3 }];
    useDashboardStore.getState().updateGridLayout(newGrid);
    expect(useDashboardStore.getState().layout.pages[1].gridLayout).toHaveLength(0);
  });

  // ── duplicateWidget ───────────────────────────────────────────────

  it("duplicateWidget adds a new widget with a unique ID", () => {
    const widget = { id: "w1", chartType: "bar", connectionId: "c1", query: "MATCH (n) RETURN n" };
    useDashboardStore.getState().addWidget(widget, { i: "w1", x: 0, y: 0, w: 4, h: 3 });
    useDashboardStore.getState().duplicateWidget("w1");
    const page = useDashboardStore.getState().layout.pages[0];
    expect(page.widgets).toHaveLength(2);
    expect(page.widgets[1].id).not.toBe("w1");
    expect(page.widgets[1].id).toBeTruthy();
  });

  it("duplicateWidget appends '(Copy)' to the widget title setting", () => {
    const widget = {
      id: "w1",
      chartType: "bar",
      connectionId: "c1",
      query: "q",
      settings: { title: "My Chart" },
    };
    useDashboardStore.getState().addWidget(widget, { i: "w1", x: 0, y: 0, w: 4, h: 3 });
    useDashboardStore.getState().duplicateWidget("w1");
    const copy = useDashboardStore.getState().layout.pages[0].widgets[1];
    expect(copy.settings?.title).toBe("My Chart (Copy)");
  });

  it("duplicateWidget places clone at next available slot using grid gravity", () => {
    const widget = { id: "w1", chartType: "bar", connectionId: "c1", query: "q" };
    useDashboardStore.getState().addWidget(widget, { i: "w1", x: 2, y: 3, w: 4, h: 3 });
    useDashboardStore.getState().duplicateWidget("w1");
    const page = useDashboardStore.getState().layout.pages[0];
    const copyGrid = page.gridLayout[1];
    // x = (gridLayout.length_before_clone * w) % 12 = (1 * 4) % 12 = 4
    expect(copyGrid.x).toBe(4);
    // y = Infinity — react-grid-layout will compact to the first available slot
    expect(copyGrid.y).toBe(Infinity);
    expect(copyGrid.w).toBe(4);
    expect(copyGrid.h).toBe(3);
  });

  it("duplicateWidget produces independent settings (deep clone)", () => {
    const widget = {
      id: "w1",
      chartType: "bar",
      connectionId: "c1",
      query: "q",
      settings: { title: "Chart", nested: { value: 42 } },
    };
    useDashboardStore.getState().addWidget(widget, { i: "w1", x: 0, y: 0, w: 4, h: 3 });
    useDashboardStore.getState().duplicateWidget("w1");
    // Mutating the original should not affect the copy
    useDashboardStore.getState().updateWidget("w1", { settings: { title: "Changed" } });
    const copy = useDashboardStore.getState().layout.pages[0].widgets[1];
    expect(copy.settings?.title).toBe("Chart (Copy)");
  });

  it("duplicateWidget copies query and connectionId from the source widget", () => {
    const widget = { id: "w1", chartType: "line", connectionId: "conn-abc", query: "MATCH (n) RETURN n" };
    useDashboardStore.getState().addWidget(widget, { i: "w1", x: 0, y: 0, w: 4, h: 3 });
    useDashboardStore.getState().duplicateWidget("w1");
    const copy = useDashboardStore.getState().layout.pages[0].widgets[1];
    expect(copy.chartType).toBe("line");
    expect(copy.connectionId).toBe("conn-abc");
    expect(copy.query).toBe("MATCH (n) RETURN n");
  });

  it("duplicateWidget is a no-op for an unknown widgetId", () => {
    const widget = { id: "w1", chartType: "bar", connectionId: "c1", query: "q" };
    useDashboardStore.getState().addWidget(widget, { i: "w1", x: 0, y: 0, w: 4, h: 3 });
    useDashboardStore.getState().duplicateWidget("does-not-exist");
    expect(useDashboardStore.getState().layout.pages[0].widgets).toHaveLength(1);
  });

  it("duplicateWidget operates only on the active page", () => {
    const widget = { id: "w1", chartType: "bar", connectionId: "c1", query: "q" };
    useDashboardStore.getState().addWidget(widget, { i: "w1", x: 0, y: 0, w: 4, h: 3 });
    useDashboardStore.getState().addPage();
    useDashboardStore.getState().setActivePage(0);
    useDashboardStore.getState().duplicateWidget("w1");
    expect(useDashboardStore.getState().layout.pages[0].widgets).toHaveLength(2);
    expect(useDashboardStore.getState().layout.pages[1].widgets).toHaveLength(0);
  });

  it("duplicateWidget sets title to undefined when source widget has no settings", () => {
    const widget = { id: "w1", chartType: "bar", connectionId: "c1", query: "q" };
    useDashboardStore.getState().addWidget(widget, { i: "w1", x: 0, y: 0, w: 4, h: 3 });
    useDashboardStore.getState().duplicateWidget("w1");
    const copy = useDashboardStore.getState().layout.pages[0].widgets[1];
    expect(copy.settings?.title).toBeUndefined();
  });

  // ── reorderPages ─────────────────────────────────────────────────

  describe("reorderPages", () => {
    function setupThreePages() {
      const layout = {
        version: 2 as const,
        pages: [
          { id: "p1", title: "Page A", widgets: [], gridLayout: [] },
          { id: "p2", title: "Page B", widgets: [], gridLayout: [] },
          { id: "p3", title: "Page C", widgets: [], gridLayout: [] },
        ],
      };
      useDashboardStore.getState().setLayout(layout);
    }

    it("moves a page from index 0 to index 2", () => {
      setupThreePages();
      useDashboardStore.getState().reorderPages(0, 2);
      const titles = useDashboardStore.getState().layout.pages.map((p) => p.title);
      expect(titles).toEqual(["Page B", "Page C", "Page A"]);
    });

    it("moves a page from index 2 to index 0", () => {
      setupThreePages();
      useDashboardStore.getState().reorderPages(2, 0);
      const titles = useDashboardStore.getState().layout.pages.map((p) => p.title);
      expect(titles).toEqual(["Page C", "Page A", "Page B"]);
    });

    it("active page index follows the moved page when it was active", () => {
      setupThreePages();
      useDashboardStore.getState().setActivePage(0);
      useDashboardStore.getState().reorderPages(0, 2);
      expect(useDashboardStore.getState().activePageIndex).toBe(2);
    });

    it("active page index adjusts when a page moves past it (from before to after)", () => {
      setupThreePages();
      useDashboardStore.getState().setActivePage(1);
      useDashboardStore.getState().reorderPages(0, 2);
      // Page at index 0 moved to 2; active was 1, should shift down to 0
      expect(useDashboardStore.getState().activePageIndex).toBe(0);
    });

    it("active page index adjusts when a page moves past it (from after to before)", () => {
      setupThreePages();
      useDashboardStore.getState().setActivePage(1);
      useDashboardStore.getState().reorderPages(2, 0);
      // Page at index 2 moved to 0; active was 1, should shift up to 2
      expect(useDashboardStore.getState().activePageIndex).toBe(2);
    });

    it("is a no-op when fromIndex === toIndex", () => {
      setupThreePages();
      useDashboardStore.getState().setActivePage(1);
      useDashboardStore.getState().reorderPages(1, 1);
      const titles = useDashboardStore.getState().layout.pages.map((p) => p.title);
      expect(titles).toEqual(["Page A", "Page B", "Page C"]);
      expect(useDashboardStore.getState().activePageIndex).toBe(1);
    });

    it("is a no-op when fromIndex is out of bounds", () => {
      setupThreePages();
      useDashboardStore.getState().reorderPages(-1, 1);
      const titles = useDashboardStore.getState().layout.pages.map((p) => p.title);
      expect(titles).toEqual(["Page A", "Page B", "Page C"]);
    });

    it("is a no-op when toIndex is out of bounds", () => {
      setupThreePages();
      useDashboardStore.getState().reorderPages(0, 5);
      const titles = useDashboardStore.getState().layout.pages.map((p) => p.title);
      expect(titles).toEqual(["Page A", "Page B", "Page C"]);
    });

    it("works with 2 pages (swap)", () => {
      const layout = {
        version: 2 as const,
        pages: [
          { id: "p1", title: "First", widgets: [], gridLayout: [] },
          { id: "p2", title: "Second", widgets: [], gridLayout: [] },
        ],
      };
      useDashboardStore.getState().setLayout(layout);
      useDashboardStore.getState().setActivePage(0);
      useDashboardStore.getState().reorderPages(0, 1);
      const titles = useDashboardStore.getState().layout.pages.map((p) => p.title);
      expect(titles).toEqual(["Second", "First"]);
      expect(useDashboardStore.getState().activePageIndex).toBe(1);
    });
  });

  it("duplicateWidget sets title to undefined when settings.title is not a string", () => {
    const widget = {
      id: "w1",
      chartType: "bar",
      connectionId: "c1",
      query: "q",
      settings: { title: 42 },
    };
    useDashboardStore.getState().addWidget(widget, { i: "w1", x: 0, y: 0, w: 4, h: 3 });
    useDashboardStore.getState().duplicateWidget("w1");
    const copy = useDashboardStore.getState().layout.pages[0].widgets[1];
    expect(copy.settings?.title).toBeUndefined();
  });

  it("duplicateWidget preserves all non-title settings from source", () => {
    const widget = {
      id: "w1",
      chartType: "bar",
      connectionId: "c1",
      query: "q",
      settings: { title: "My Widget", color: "red", limit: 100 },
    };
    useDashboardStore.getState().addWidget(widget, { i: "w1", x: 0, y: 0, w: 4, h: 3 });
    useDashboardStore.getState().duplicateWidget("w1");
    const copy = useDashboardStore.getState().layout.pages[0].widgets[1];
    expect(copy.settings?.color).toBe("red");
    expect(copy.settings?.limit).toBe(100);
    expect(copy.settings?.title).toBe("My Widget (Copy)");
  });

  it("duplicateWidget assigns a grid item with the new widget's ID", () => {
    const widget = { id: "w1", chartType: "bar", connectionId: "c1", query: "q" };
    useDashboardStore.getState().addWidget(widget, { i: "w1", x: 0, y: 0, w: 6, h: 2 });
    useDashboardStore.getState().duplicateWidget("w1");
    const page = useDashboardStore.getState().layout.pages[0];
    const copyWidget = page.widgets[1];
    const copyGrid = page.gridLayout[1];
    expect(copyGrid.i).toBe(copyWidget.id);
  });
});
