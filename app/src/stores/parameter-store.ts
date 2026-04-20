import { create } from "zustand";

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
  /** The widget ID that set this parameter — enables scroll-to-source on tag click. */
  sourceWidgetId?: string;
}

interface ParameterState {
  parameters: Record<string, ParameterEntry>;
  setParameter: (
    name: string,
    value: unknown,
    source: string,
    field: string,
    type?: ParameterType,
    sourceType?: ParameterSource,
    sourceWidgetId?: string,
  ) => void;
  /** Atomically set multiple parameters in a single state update (no intermediate renders). */
  setParametersBatch: (
    entries: Array<{
      name: string;
      value: unknown;
      source: string;
      field: string;
      type?: ParameterType;
      sourceType?: ParameterSource;
      sourceWidgetId?: string;
    }>,
  ) => void;
  clearParameter: (name: string) => void;
  clearAll: () => void;
  /** Save current parameters to localStorage for the given dashboard. */
  saveToDashboard: (dashboardId: string) => void;
  /** Restore parameters from localStorage for the given dashboard. Clears current state first. */
  restoreFromDashboard: (dashboardId: string) => void;
}

const STORAGE_PREFIX = "nb-params:";

/**
 * Coerce a value to the expected type. Returns the coerced value,
 * or undefined if the value can't be coerced (caller should reject).
 */
function coerceValue(
  value: unknown,
  type: ParameterType,
): { ok: true; value: unknown } | { ok: false; reason: string } {
  switch (type) {
    case "number-range": {
      if (typeof value === "number") return { ok: true, value };
      if (typeof value === "string") {
        const n = Number(value);
        if (!Number.isNaN(n)) return { ok: true, value: n };
        return { ok: false, reason: `Cannot coerce "${value}" to number` };
      }
      // Validate array shape: must be [number, number]
      if (Array.isArray(value)) {
        if (value.length !== 2)
          return { ok: false, reason: "number-range must be [min, max]" };
        const min = Number(value[0]);
        const max = Number(value[1]);
        if (Number.isNaN(min) || Number.isNaN(max))
          return { ok: false, reason: "number-range values must be numeric" };
        return { ok: true, value: [min, max] };
      }
      return {
        ok: false,
        reason: `Invalid number-range value: ${typeof value}`,
      };
    }
    case "date":
    case "date-relative": {
      if (typeof value === "string") return { ok: true, value };
      if (value instanceof Date)
        return { ok: true, value: value.toISOString() };
      if (typeof value === "number")
        return { ok: true, value: new Date(value).toISOString() };
      return {
        ok: false,
        reason: `Invalid ${type} value: expected string or Date`,
      };
    }
    case "date-range": {
      if (typeof value === "string") return { ok: true, value };
      // Validate object shape: must have from and to as strings
      if (
        typeof value === "object" &&
        value !== null &&
        "from" in value &&
        "to" in value
      ) {
        const obj = value as { from: unknown; to: unknown };
        if (typeof obj.from === "string" && typeof obj.to === "string")
          return { ok: true, value };
        return { ok: false, reason: "date-range from/to must be strings" };
      }
      return {
        ok: false,
        reason: "Invalid date-range value: expected {from, to} or string",
      };
    }
    case "multi-select": {
      if (Array.isArray(value)) return { ok: true, value };
      // Accept scalar as single-element array
      if (typeof value === "string" || typeof value === "number")
        return { ok: true, value: [value] };
      return { ok: false, reason: "multi-select value must be an array" };
    }
    default:
      // text, select, cascading-select — accept as-is
      return { ok: true, value };
  }
}

export const useParameterStore = create<ParameterState>((set, get) => ({
  parameters: {},

  setParameter: (
    name,
    value,
    source,
    field,
    type = "text",
    sourceType = "click-action",
    sourceWidgetId?,
  ) => {
    const result = coerceValue(value, type);
    if (!result.ok) {
      console.warn(
        `[parameter-store] Type mismatch for "${name}" (${type}):`,
        result.reason,
      );
      return;
    }
    set((state) => ({
      parameters: {
        ...state.parameters,
        [name]: {
          value: result.value,
          source,
          field,
          type,
          sourceType,
          sourceWidgetId,
        },
      },
    }));
  },

  setParametersBatch: (entries) => {
    set((state) => {
      const next = { ...state.parameters };
      for (const entry of entries) {
        const result = coerceValue(entry.value, entry.type ?? "text");
        if (!result.ok) {
          console.warn(
            `[parameter-store] Type mismatch for "${entry.name}" (${entry.type}):`,
            result.reason,
          );
          continue;
        }
        next[entry.name] = {
          value: result.value,
          source: entry.source,
          field: entry.field,
          type: entry.type ?? "text",
          sourceType: entry.sourceType ?? "click-action",
          sourceWidgetId: entry.sourceWidgetId,
        };
      }
      return { parameters: next };
    });
  },

  clearParameter: (name) =>
    set((state) => {
      const next = { ...state.parameters };
      delete next[name];
      return { parameters: next };
    }),

  clearAll: () => set({ parameters: {} }),

  saveToDashboard: (dashboardId) => {
    const { parameters } = get();
    const key = `${STORAGE_PREFIX}${dashboardId}`;
    try {
      if (Object.keys(parameters).length > 0) {
        localStorage.setItem(key, JSON.stringify(parameters));
      } else {
        localStorage.removeItem(key);
      }
    } catch {
      // localStorage may throw on quota exceeded (e.g. Safari Private Mode).
      // Silently degrade — parameters will not persist across navigation.
      console.warn(
        "[parameter-store] Failed to save parameters to localStorage",
      );
    }
  },

  restoreFromDashboard: (dashboardId) => {
    try {
      const stored = localStorage.getItem(`${STORAGE_PREFIX}${dashboardId}`);
      set({ parameters: stored ? JSON.parse(stored) : {} });
    } catch {
      set({ parameters: {} });
    }
  },
}));

/**
 * Returns just name→value for query substitution.
 * Uses a cached reference that only changes when parameter values
 * actually change, avoiding unnecessary downstream re-renders.
 */
let cachedValues: Record<string, unknown> = {};
let cachedParametersRef: Record<string, ParameterEntry> | null = null;

function deriveValues(
  parameters: Record<string, ParameterEntry>,
): Record<string, unknown> {
  if (parameters === cachedParametersRef) return cachedValues;
  const next: Record<string, unknown> = {};
  for (const [k, e] of Object.entries(parameters)) {
    next[k] = e.value;
  }
  if (cachedParametersRef !== null && shallowEqual(cachedValues, next)) {
    cachedParametersRef = parameters;
    return cachedValues;
  }
  cachedParametersRef = parameters;
  cachedValues = next;
  return next;
}

function shallowEqual(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

export function useParameterValues(): Record<string, unknown> {
  return useParameterStore((s) => deriveValues(s.parameters));
}
