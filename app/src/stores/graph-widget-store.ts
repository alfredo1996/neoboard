import { create } from "zustand";
import type { GraphNode, GraphEdge } from "@neoboard/components";
import type { GraphLayout } from "@neoboard/components";

interface GraphWidgetState {
  nodes: GraphNode[];
  edges: GraphEdge[];
  layout?: GraphLayout;
  captionMap?: Record<string, string>;
  /**
   * Server-generated resultId from the last query execution: a hash of what
   * was asked (connection, database, query, params, row limit), not of the
   * rows returned (computeResultId). Used to detect when the widget runs a
   * different query, so stale exploration state is discarded instead of being
   * shown on top of the new query's data.
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
