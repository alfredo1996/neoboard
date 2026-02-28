import { create } from "zustand";
import type {
  DashboardLayoutV2,
  DashboardPage,
  DashboardWidget,
  GridLayoutItem,
} from "@/lib/db/schema";

interface DashboardState {
  layout: DashboardLayoutV2;
  activePageIndex: number;
  editMode: boolean;

  // Layout
  setLayout: (layout: DashboardLayoutV2, initialPageIndex?: number) => void;
  setEditMode: (editMode: boolean) => void;
  reset: () => void;

  // Page management
  setActivePage: (index: number) => void;
  addPage: () => void;
  removePage: (index: number) => void;
  renamePage: (index: number, title: string) => void;
  reorderPages: (fromIndex: number, toIndex: number) => void;

  // Widget management (operate on active page)
  addWidget: (widget: DashboardWidget, gridItem: GridLayoutItem) => void;
  removeWidget: (widgetId: string) => void;
  updateWidget: (widgetId: string, updates: Partial<DashboardWidget>) => void;
  updateGridLayout: (gridLayout: GridLayoutItem[]) => void;
  duplicateWidget: (widgetId: string) => void;
}

const defaultPage = (): DashboardPage => ({
  id: crypto.randomUUID(),
  title: "Page 1",
  widgets: [],
  gridLayout: [],
});

const emptyLayout: DashboardLayoutV2 = {
  version: 2,
  pages: [defaultPage()],
};

function updatePage(
  pages: DashboardPage[],
  index: number,
  updater: (page: DashboardPage) => DashboardPage
): DashboardPage[] {
  return pages.map((p, i) => (i === index ? updater(p) : p));
}

export const useDashboardStore = create<DashboardState>((set) => ({
  layout: emptyLayout,
  activePageIndex: 0,
  editMode: false,

  setLayout: (layout, initialPageIndex = 0) =>
    set({
      layout,
      activePageIndex: Math.min(
        isNaN(initialPageIndex) ? 0 : initialPageIndex,
        layout.pages.length - 1
      ),
    }),
  setEditMode: (editMode) => set({ editMode }),
  reset: () =>
    set({ layout: emptyLayout, activePageIndex: 0, editMode: false }),

  // ── Page management ──────────────────────────────────────────────

  setActivePage: (index) => set({ activePageIndex: index }),

  addPage: () =>
    set((state) => {
      const n = state.layout.pages.length + 1;
      const newPage: DashboardPage = {
        id: crypto.randomUUID(),
        title: `Page ${n}`,
        widgets: [],
        gridLayout: [],
      };
      return {
        layout: { ...state.layout, pages: [...state.layout.pages, newPage] },
        activePageIndex: state.layout.pages.length,
      };
    }),

  removePage: (index) =>
    set((state) => {
      if (state.layout.pages.length <= 1) return state;
      const pages = state.layout.pages.filter((_, i) => i !== index);
      const activePageIndex = Math.min(
        state.activePageIndex,
        pages.length - 1
      );
      return { layout: { ...state.layout, pages }, activePageIndex };
    }),

  renamePage: (index, title) =>
    set((state) => ({
      layout: {
        ...state.layout,
        pages: updatePage(state.layout.pages, index, (p) => ({
          ...p,
          title,
        })),
      },
    })),

  reorderPages: (fromIndex, toIndex) =>
    set((state) => {
      const pageCount = state.layout.pages.length;
      const valid =
        Number.isInteger(fromIndex) &&
        Number.isInteger(toIndex) &&
        fromIndex >= 0 &&
        toIndex >= 0 &&
        fromIndex < pageCount &&
        toIndex < pageCount;
      if (!valid || fromIndex === toIndex) return state;
      const pages = [...state.layout.pages];
      const [moved] = pages.splice(fromIndex, 1);
      if (!moved) return state;
      pages.splice(toIndex, 0, moved);
      let newActive = state.activePageIndex;
      if (state.activePageIndex === fromIndex) {
        newActive = toIndex;
      } else if (
        fromIndex < state.activePageIndex &&
        toIndex >= state.activePageIndex
      ) {
        newActive = state.activePageIndex - 1;
      } else if (
        fromIndex > state.activePageIndex &&
        toIndex <= state.activePageIndex
      ) {
        newActive = state.activePageIndex + 1;
      }
      return { layout: { ...state.layout, pages }, activePageIndex: newActive };
    }),

  // ── Widget management (active page) ──────────────────────────────

  addWidget: (widget, gridItem) =>
    set((state) => {
      const idx = state.activePageIndex;
      return {
        layout: {
          ...state.layout,
          pages: updatePage(state.layout.pages, idx, (p) => ({
            ...p,
            widgets: [...p.widgets, widget],
            gridLayout: [...p.gridLayout, gridItem],
          })),
        },
      };
    }),

  removeWidget: (widgetId) =>
    set((state) => {
      const idx = state.activePageIndex;
      return {
        layout: {
          ...state.layout,
          pages: updatePage(state.layout.pages, idx, (p) => ({
            ...p,
            widgets: p.widgets.filter((w) => w.id !== widgetId),
            gridLayout: p.gridLayout.filter((g) => g.i !== widgetId),
          })),
        },
      };
    }),

  updateWidget: (widgetId, updates) =>
    set((state) => {
      const idx = state.activePageIndex;
      return {
        layout: {
          ...state.layout,
          pages: updatePage(state.layout.pages, idx, (p) => ({
            ...p,
            widgets: p.widgets.map((w) =>
              w.id === widgetId ? { ...w, ...updates } : w
            ),
          })),
        },
      };
    }),

  updateGridLayout: (gridLayout) =>
    set((state) => {
      const idx = state.activePageIndex;
      return {
        layout: {
          ...state.layout,
          pages: updatePage(state.layout.pages, idx, (p) => ({
            ...p,
            gridLayout,
          })),
        },
      };
    }),

  duplicateWidget: (widgetId) =>
    set((state) => {
      const idx = state.activePageIndex;
      const page = state.layout.pages[idx];
      const source = page.widgets.find((w) => w.id === widgetId);
      const sourceGrid = page.gridLayout.find((g) => g.i === widgetId);
      if (!source || !sourceGrid) return state;

      const newId = crypto.randomUUID();
      const clonedWidget: DashboardWidget = {
        ...structuredClone(source),
        id: newId,
        settings: {
          ...structuredClone(source.settings ?? {}),
          title:
            typeof source.settings?.title === "string"
              ? `${source.settings.title} (Copy)`
              : undefined,
        },
      };
      // Place the clone at the next available slot using grid gravity
      // (same strategy as addWidget) instead of x+1/y+1 which causes overlap.
      const clonedGrid: GridLayoutItem = {
        ...sourceGrid,
        i: newId,
        x: (page.gridLayout.length * sourceGrid.w) % 12,
        y: Infinity, // react-grid-layout compacts to the first available slot
      };

      return {
        layout: {
          ...state.layout,
          pages: updatePage(state.layout.pages, idx, (p) => ({
            ...p,
            widgets: [...p.widgets, clonedWidget],
            gridLayout: [...p.gridLayout, clonedGrid],
          })),
        },
      };
    }),
}));
