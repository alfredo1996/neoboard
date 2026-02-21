import { create } from "zustand";
import type { GraphNode, GraphEdge } from "@neoboard/components";
import type { GraphLayout } from "@neoboard/components";

interface GraphWidgetState {
  nodes: GraphNode[];
  edges: GraphEdge[];
  layout?: GraphLayout;
  captionMap?: Record<string, string>;
  /**
   * Server-generated resultId (SHA-256 of query result data) from the last
   * query execution. Used to detect when the underlying data changed so stale
   * exploration state is discarded instead of being shown on top of new data.
   */
  resultId?: string;
}

interface GraphWidgetStore {
  states: Record<string, GraphWidgetState>;
  setState: (widgetId: string, s: Partial<GraphWidgetState>) => void;
}

export const useGraphWidgetStore = create<GraphWidgetStore>((set) => ({
  states: {},
  setState: (widgetId, s) =>
    set((prev) => ({
      states: {
        ...prev.states,
        [widgetId]: {
          ...prev.states[widgetId],
          ...s,
        },
      },
    })),
}));
