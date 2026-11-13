"use client";

import { useCallback, useEffect } from "react";
import { useParameterStore } from "@/stores/parameter-store";
import type { ParameterType, ParameterEntry } from "@/stores/parameter-store";

export interface ParamActions {
  /** `label` is what the selector shows for the value, for the filter chip. */
  set: (value: unknown, label?: string) => void;
  clear: () => void;
  /** Also sets a companion sub-parameter (e.g. _from, _min). */
  setCompanion: (suffix: string, value: unknown, type: ParameterType) => void;
  /** Clears a companion sub-parameter. */
  clearCompanion: (suffix: string) => void;
  /** Replaces only the value, keeping who set it (a link stays "Set by URL"). */
  retype: (value: unknown) => void;
  /** Sets the label the filter chip shows for the current value. */
  setLabel: (label: string) => void;
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
  const setParameterLabel = useParameterStore((s) => s.setParameterLabel);

  const set = useCallback(
    (value: unknown, label?: string) => {
      setParameter(
        parameterName,
        value,
        "Parameter Selector",
        parameterName,
        parameterType,
        "selector-widget",
        widgetId,
      );
      if (label !== undefined) setParameterLabel(parameterName, label);
    },
    [parameterName, parameterType, setParameter, setParameterLabel, widgetId],
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

  const setLabel = useCallback(
    (label: string) => setParameterLabel(parameterName, label),
    [parameterName, setParameterLabel],
  );

  return {
    set,
    clear,
    setLabel,
    setCompanion,
    clearCompanion,
    retype,
    currentEntry,
  };
}

type SeedOption = { value: string; label?: string; rawValue?: unknown };

/** The typed `rawValue` of the option a string names, else the value itself. */
export function rawValueOf(v: unknown, options: SeedOption[]): unknown {
  if (typeof v !== "string") return v;
  const opt = options.find((o) => o.value === v);
  return opt?.rawValue !== undefined ? opt.rawValue : v;
}

/**
 * Rewrites a stored string as the typed value of the option it names, once
 * the options load: a default or a link without a type marker is text, and
 * "1999" does not match a numeric column (#2097, #2114). A marked one needs
 * no options (#2124, #2158).
 *
 * Also writes the options' label for the value, so a default, a link or a
 * click action reads "All continents" on the chip like a pick does, and a
 * Only fills a missing label, never replaces one: two selectors on one
 * parameter whose seeds label a value differently would otherwise overwrite
 * each other forever (#2334). A label is not restored from storage, so the
 * fill writes it fresh once the options load.
 *
 * ponytail: only the loaded options can type or label a value. An unmarked
 * default the seed's first page lacks stays a string, unlabelled.
 */
export function useTypedSelection(
  { currentEntry, retype, setLabel }: ParamActions,
  options: SeedOption[],
) {
  const value = currentEntry?.value;
  const label = currentEntry?.label;
  useEffect(() => {
    const items: unknown[] = Array.isArray(value) ? value : [value];
    const typed = items.map((v) => rawValueOf(v, options));
    if (typed.some((v, i) => v !== items[i])) {
      retype(Array.isArray(value) ? typed : typed[0]);
      return; // the retyped value runs this again
    }
    const labels = items.map(
      (v) => options.find((o) => o.value === v || o.rawValue === v)?.label,
    );
    if (value === undefined || labels.includes(undefined)) return;
    const joined = labels.join(", ");
    if (label === undefined) setLabel(joined);
  }, [value, label, options, retype, setLabel]);
}
