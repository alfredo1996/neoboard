import { create } from "zustand";
import type {
  DashboardLayout,
  DashboardWidget,
  GridLayoutItem,
} from "@/lib/db/schema";

interface DashboardState {
  layout: DashboardLayout;
  editMode: boolean;
  setLayout: (layout: DashboardLayout) => void;
  setEditMode: (editMode: boolean) => void;
  addWidget: (widget: DashboardWidget, gridItem: GridLayoutItem) => void;
  removeWidget: (widgetId: string) => void;
  updateWidget: (widgetId: string, updates: Partial<DashboardWidget>) => void;
  updateGridLayout: (gridLayout: GridLayoutItem[]) => void;
  reset: () => void;
}

const emptyLayout: DashboardLayout = { widgets: [], gridLayout: [] };

export const useDashboardStore = create<DashboardState>((set) => ({
  layout: emptyLayout,
  editMode: false,

  setLayout: (layout) => set({ layout }),
  setEditMode: (editMode) => set({ editMode }),

  addWidget: (widget, gridItem) =>
    set((state) => ({
      layout: {
        widgets: [...state.layout.widgets, widget],
        gridLayout: [...state.layout.gridLayout, gridItem],
      },
    })),

  removeWidget: (widgetId) =>
    set((state) => ({
      layout: {
        widgets: state.layout.widgets.filter((w) => w.id !== widgetId),
        gridLayout: state.layout.gridLayout.filter((g) => g.i !== widgetId),
      },
    })),

  updateWidget: (widgetId, updates) =>
    set((state) => ({
      layout: {
        ...state.layout,
        widgets: state.layout.widgets.map((w) =>
          w.id === widgetId ? { ...w, ...updates } : w
        ),
      },
    })),

  updateGridLayout: (gridLayout) =>
    set((state) => ({
      layout: { ...state.layout, gridLayout },
    })),

  reset: () => set({ layout: emptyLayout, editMode: false }),
}));
