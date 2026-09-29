"use client";

import { useCallback, useEffect } from "react";
import { useParameterStore } from "@/stores/parameter-store";
import type { ParameterType, ParameterEntry } from "@/stores/parameter-store";

export interface ParamActions {
  set: (value: unknown) => void;
  clear: () => void;
  /** Also sets a companion sub-parameter (e.g. _from, _min). */
  setCompanion: (suffix: string, value: unknown, type: ParameterType) => void;
  /** Clears a companion sub-parameter. */
  clearCompanion: (suffix: string) => void;
  currentEntry: ParameterEntry | undefined;
}

export function useParamActions(
  parameterName: string,
  parameterType: ParameterType,
  widgetId?: string,
): ParamActions {
  const currentEntry = useParameterStore((s) => s.parameters[parameterName]);
  const setParameter = useParameterStore((s) => s.setParameter);
  const clearParameter = useParameterStore((s) => s.clearParameter);

  const set = useCallback(
    (value: unknown) =>
      setParameter(
        parameterName,
        value,
        "Parameter Selector",
        parameterName,
        parameterType,
        "selector-widget",
        widgetId,
      ),
    [parameterName, parameterType, setParameter, widgetId],
  );

  const clear = useCallback(
    () => clearParameter(parameterName),
    [parameterName, clearParameter],
  );

  const setCompanion = useCallback(
    (suffix: string, value: unknown, type: ParameterType) =>
      setParameter(
        `${parameterName}_${suffix}`,
        value,
        "Parameter Selector",
        `${parameterName}_${suffix}`,
        type,
        "selector-widget",
        widgetId,
      ),
    [parameterName, setParameter, widgetId],
  );

  const clearCompanion = useCallback(
    (suffix: string) => clearParameter(`${parameterName}_${suffix}`),
    [parameterName, clearParameter],
  );

  return {
    set,
    clear,
    setCompanion,
    clearCompanion,
    currentEntry,
  };
}

type SeedOption = { value: string; rawValue?: unknown };

/** The typed `rawValue` of the option a string names, else the value itself. */
export function rawValueOf(v: unknown, options: SeedOption[]): unknown {
  if (typeof v !== "string") return v;
  const opt = options.find((o) => o.value === v);
  return opt?.rawValue !== undefined ? opt.rawValue : v;
}

/**
 * Rewrites a stored string as the typed value of the option it names, once
 * the options load. A link carries only text, so a year picked as 1999 came
 * back as "1999" and no longer matched a numeric column (#2097).
 */
export function useTypedSelection(
  { currentEntry, set }: ParamActions,
  options: SeedOption[],
) {
  const value = currentEntry?.value;
  useEffect(() => {
    const items: unknown[] = Array.isArray(value) ? value : [value];
    const typed = items.map((v) => rawValueOf(v, options));
    if (typed.some((v, i) => v !== items[i])) {
      set(Array.isArray(value) ? typed : typed[0]);
    }
  }, [value, options, set]);
}
