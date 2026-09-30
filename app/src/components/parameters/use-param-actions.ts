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
  /** Replaces only the value, keeping who set it (a link stays "Set by URL"). */
  retype: (value: unknown) => void;
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

  const retype = useCallback(
    (value: unknown) => {
      if (!currentEntry) return;
      const { source, field, type, sourceType, sourceWidgetId } = currentEntry;
      setParameter(
        parameterName,
        value,
        source,
        field,
        type,
        sourceType,
        sourceWidgetId,
      );
    },
    [currentEntry, parameterName, setParameter],
  );

  return {
    set,
    clear,
    setCompanion,
    clearCompanion,
    retype,
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
 * back as "1999" and no longer matched a numeric column (#2097, #2114).
 *
 * ponytail: only the loaded options can type a value. A server-filtered seed
 * loads the rows for an empty search, so a value found by searching stays a
 * string after a link reload; typing it without the options needs the URL
 * to carry the type (#2114 follow-up).
 */
export function useTypedSelection(
  { currentEntry, retype }: ParamActions,
  options: SeedOption[],
) {
  const value = currentEntry?.value;
  useEffect(() => {
    const items: unknown[] = Array.isArray(value) ? value : [value];
    const typed = items.map((v) => rawValueOf(v, options));
    if (typed.some((v, i) => v !== items[i])) {
      retype(Array.isArray(value) ? typed : typed[0]);
    }
  }, [value, options, retype]);
}
