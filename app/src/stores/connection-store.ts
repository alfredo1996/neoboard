import { create } from "zustand";

interface ConnectionState {
  activeConnectionId: string | null;
  widgetConnections: Record<string, string>; // widgetId -> connectionId
  setActiveConnection: (id: string | null) => void;
  setWidgetConnection: (widgetId: string, connectionId: string) => void;
  removeWidgetConnection: (widgetId: string) => void;
  reset: () => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  activeConnectionId: null,
  widgetConnections: {},

  setActiveConnection: (id) => set({ activeConnectionId: id }),

  setWidgetConnection: (widgetId, connectionId) =>
    set((state) => ({
      widgetConnections: {
        ...state.widgetConnections,
        [widgetId]: connectionId,
      },
    })),

  removeWidgetConnection: (widgetId) =>
    set((state) => {
      const next = { ...state.widgetConnections };
      delete next[widgetId];
      return { widgetConnections: next };
    }),

  reset: () => set({ activeConnectionId: null, widgetConnections: {} }),
}));
