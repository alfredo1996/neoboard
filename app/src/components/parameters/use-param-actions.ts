"use client";

import { useCallback } from "react";
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
