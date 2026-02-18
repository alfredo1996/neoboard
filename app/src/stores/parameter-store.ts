import { create } from "zustand";

export interface ParameterEntry {
  value: unknown;
  source: string; // widget title that set it
  field: string; // which data field was clicked
}

interface ParameterState {
  parameters: Record<string, ParameterEntry>;
  setParameter: (
    name: string,
    value: unknown,
    source: string,
    field: string
  ) => void;
  clearParameter: (name: string) => void;
  clearAll: () => void;
}

export const useParameterStore = create<ParameterState>((set) => ({
  parameters: {},

  setParameter: (name, value, source, field) =>
    set((state) => ({
      parameters: {
        ...state.parameters,
        [name]: { value, source, field },
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
  return useParameterStore((s) => {
    const result: Record<string, unknown> = {};
    for (const [name, entry] of Object.entries(s.parameters)) {
      result[name] = entry.value;
    }
    return result;
  });
}
