import { create } from "zustand";
import type { GraphNode, GraphEdge } from "@neoboard/components";
import type { GraphLayout } from "@neoboard/components";

interface GraphWidgetState {
  nodes: GraphNode[];
  edges: GraphEdge[];
  layout?: GraphLayout;
  captionMap?: Record<string, string>;
  /**
   * Sorted, joined IDs of the nodes that came directly from the widget query.
   * Used to detect when the query result changed so stale exploration state
   * can be discarded instead of being shown on top of new data.
   */
  queryNodeSignature?: string;
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
