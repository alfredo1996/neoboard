import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

/**
 * The 8 parameter widget types supported by the parameter selector system.
 * - text: free-text input, no DB query
 * - select: single-select dropdown from DB query (label + value columns)
 * - multi-select: multi-select dropdown from DB query
 * - date: single date picker, sets ISO string parameter
 * - date-range: sets `{name}_from` and `{name}_to`
 * - date-relative: preset buttons (Today, Last 7 days, etc.)
 * - number-range: dual-handle slider, sets `{name}_min` and `{name}_max`
 * - cascading-select: re-fetches options when parent parameter changes
 */
export type ParameterType =
  | "text"
  | "select"
  | "multi-select"
  | "date"
  | "date-range"
  | "date-relative"
  | "number-range"
  | "cascading-select";

/**
 * Source of the parameter value — kept extensible for enterprise features
 * like cross-dashboard and URL-sourced parameters.
 */
export type ParameterSource =
  | "click-action"
  | "selector-widget"
  | "url"
  | "cross-dashboard";

export interface ParameterEntry {
  value: unknown;
  source: string; // widget title that set it
  field: string; // which data field was clicked / parameter name for selectors
  /** Discriminates the 8 widget types; defaults to 'text' for click-action entries */
  type: ParameterType;
  /** Machine-readable source classification */
  sourceType: ParameterSource;
}

interface ParameterState {
  parameters: Record<string, ParameterEntry>;
  setParameter: (
    name: string,
    value: unknown,
    source: string,
    field: string,
    type?: ParameterType,
    sourceType?: ParameterSource
  ) => void;
  clearParameter: (name: string) => void;
  clearAll: () => void;
}

export const useParameterStore = create<ParameterState>((set) => ({
  parameters: {},

  setParameter: (
    name,
    value,
    source,
    field,
    type = "text",
    sourceType = "click-action"
  ) =>
    set((state) => ({
      parameters: {
        ...state.parameters,
        [name]: { value, source, field, type, sourceType },
      },
    })),

  clearParameter: (name) =>
    set((state) => {
      const next = { ...state.parameters };
      delete next[name];
      return { parameters: next };
    }),

  clearAll: () => set({ parameters: {} }),
}));

/** Returns just name→value for query substitution. */
export function useParameterValues(): Record<string, unknown> {
  return useParameterStore(
    useShallow((s) => {
      const result: Record<string, unknown> = {};
      for (const [name, entry] of Object.entries(s.parameters)) {
        result[name] = entry.value;
      }
      return result;
    })
  );
}
