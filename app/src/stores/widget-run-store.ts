import { create } from "zustand";

/**
 * Manual-run widgets whose Run Query was clicked. Kept outside the card so an
 * evicted dashboard page (#1475) comes back with its result, not the overlay.
 */
interface WidgetRunStore {
  ran: Record<string, true>;
  markRan: (widgetId: string) => void;
}

export const useWidgetRunStore = create<WidgetRunStore>((set) => ({
  ran: {},
  markRan: (widgetId) => set((s) => ({ ran: { ...s.ran, [widgetId]: true } })),
}));
