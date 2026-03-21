import { create } from "zustand";
import type {
  DashboardLayoutV2,
  DashboardPage,
  DashboardWidget,
  GridLayoutItem,
} from "@/lib/db/schema";

interface DashboardState {
  layout: DashboardLayoutV2;
  savedLayout: DashboardLayoutV2 | null;
  /** Tracks whether any mutation has occurred since the last save/load.
   *  Avoids O(n) JSON.stringify comparison on every check. */
  _dirty: boolean;
  activePageIndex: number;
  editMode: boolean;

  // Layout
  setLayout: (layout: DashboardLayoutV2, initialPageIndex?: number) => void;
  setEditMode: (editMode: boolean) => void;
  reset: () => void;

  // Unsaved changes tracking
  hasUnsavedChanges: () => boolean;
  markSaved: () => void;

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

function withActivePage(
  state: DashboardState,
  updater: (p: DashboardPage) => DashboardPage,
) {
  return {
    layout: {
      ...state.layout,
      pages: updatePage(state.layout.pages, state.activePageIndex, updater),
    },
  };
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  layout: emptyLayout,
  savedLayout: null,
  _dirty: false,
  activePageIndex: 0,
  editMode: false,

  setLayout: (layout, initialPageIndex = 0) =>
    set({
      layout,
      savedLayout: JSON.parse(JSON.stringify(layout)) as DashboardLayoutV2,
      _dirty: false,
      activePageIndex: Math.min(
        isNaN(initialPageIndex) ? 0 : initialPageIndex,
        layout.pages.length - 1
      ),
    }),
  setEditMode: (editMode) => set({ editMode }),
  reset: () =>
    set({ layout: emptyLayout, savedLayout: null, _dirty: false, activePageIndex: 0, editMode: false }),

  // Unsaved changes tracking — uses dirty flag for O(1) checks
  hasUnsavedChanges: () => {
    const { savedLayout, _dirty } = get();
    if (savedLayout === null) return false;
    return _dirty;
  },
  markSaved: () =>
    set((state) => ({
      savedLayout: JSON.parse(
        JSON.stringify(state.layout)
      ) as DashboardLayoutV2,
      _dirty: false,
    })),

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
        _dirty: true,
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
      return { layout: { ...state.layout, pages }, activePageIndex, _dirty: true };
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
      _dirty: true,
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
      return { layout: { ...state.layout, pages }, activePageIndex: newActive, _dirty: true };
    }),

  // ── Widget management (active page) ──────────────────────────────

  addWidget: (widget, gridItem) =>
    set((state) => ({
      ...withActivePage(state, (p) => ({
        ...p,
        widgets: [...p.widgets, widget],
        gridLayout: [...p.gridLayout, gridItem],
      })),
      _dirty: true,
    })),

  removeWidget: (widgetId) =>
    set((state) => ({
      ...withActivePage(state, (p) => ({
        ...p,
        widgets: p.widgets.filter((w) => w.id !== widgetId),
        gridLayout: p.gridLayout.filter((g) => g.i !== widgetId),
      })),
      _dirty: true,
    })),

  updateWidget: (widgetId, updates) =>
    set((state) => ({
      ...withActivePage(state, (p) => ({
        ...p,
        widgets: p.widgets.map((w) =>
          w.id === widgetId ? { ...w, ...updates } : w,
        ),
      })),
      _dirty: true,
    })),

  updateGridLayout: (gridLayout) =>
    set((state) => ({
      ...withActivePage(state, (p) => ({
        ...p,
        gridLayout,
      })),
      _dirty: true,
    })),

  duplicateWidget: (widgetId) =>
    set((state) => {
      const page = state.layout.pages[state.activePageIndex];
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
      const clonedGrid: GridLayoutItem = {
        ...sourceGrid,
        i: newId,
        x: (page.gridLayout.length * sourceGrid.w) % 12,
        y: Infinity,
      };

      return {
        ...withActivePage(state, (p) => ({
          ...p,
          widgets: [...p.widgets, clonedWidget],
          gridLayout: [...p.gridLayout, clonedGrid],
        })),
        _dirty: true,
      };
    }),
}));
