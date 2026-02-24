"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParameterStore } from "@/stores/parameter-store";
import type { ParameterType } from "@/stores/parameter-store";
import { resolveRelativePreset } from "@/lib/date-utils";
import {
  TextInputParameter,
  ParamSelector,
  ParamMultiSelector,
  DatePickerParameter,
  DateRangeParameter,
  DateRelativePicker,
  NumberRangeSlider,
  CascadingSelector,
  type ParamSelectorOption,
  type RelativeDatePreset,
} from "@neoboard/components";

// ─── Seed-query fetch ────────────────────────────────────────────────────────

interface SeedQueryResult {
  data: unknown;
}

/**
 * Fetches seed query options for select/multi-select/cascading widgets.
 * Returns an array of { label, value } pairs.
 * The first column is used as value; the second (if present) as label,
 * otherwise label falls back to value.
 */
function useSeedQuery(
  connectionId: string | undefined,
  query: string | undefined,
  enabled: boolean,
  extraParams?: Record<string, unknown>
): { options: ParamSelectorOption[]; loading: boolean } {
  const { data, isLoading } = useQuery<SeedQueryResult>({
    queryKey: ["param-seed", connectionId, query, extraParams],
    queryFn: async () => {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId,
          query,
          params: extraParams ?? {},
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error((body.error as string | undefined) || "Seed query failed");
      }
      return res.json() as Promise<SeedQueryResult>;
    },
    enabled: enabled && !!connectionId && !!query,
    staleTime: 30_000, // 30 s — options don't change often
    retry: false,
  });

  const options = useMemo((): ParamSelectorOption[] => {
    if (!data?.data) return [];
    const rows = Array.isArray(data.data) ? data.data : [];
    return rows.map((row: unknown) => {
      if (row && typeof row === "object") {
        const r = row as Record<string, unknown>;
        const keys = Object.keys(r);
        const valueKey = keys[0] ?? "";
        const labelKey = keys[1] ?? valueKey;
        const value = String(r[valueKey] ?? "");
        const label = String(r[labelKey] ?? value);
        return { value, label };
      }
      return { value: String(row), label: String(row) };
    });
  }, [data]);

  return { options, loading: isLoading };
}

// ─── Widget config ───────────────────────────────────────────────────────────

export interface ParameterWidgetConfig {
  /** The parameter name (without $param_ prefix) */
  parameterName: string;
  /** Which of the 8 selector types to render */
  parameterType: ParameterType;
  /** DB connection for seed queries (select, multi-select, cascading) */
  connectionId?: string;
  /** SQL/Cypher query that returns label+value rows for select types */
  seedQuery?: string;
  /** For cascading: the parent parameter name whose value seeds this query */
  parentParameterName?: string;
  /** For number-range: the lower bound of the slider */
  rangeMin?: number;
  /** For number-range: the upper bound of the slider */
  rangeMax?: number;
  /** For number-range: the step increment */
  rangeStep?: number;
  placeholder?: string;
  className?: string;
}

// ─── Main renderer ───────────────────────────────────────────────────────────

/**
 * ParameterWidgetRenderer — app-layer orchestrator.
 *
 * Architecture boundary:
 * - Reads/writes the parameter Zustand store (app concern)
 * - Fetches seed query options via the /api/query route (app concern)
 * - Delegates pure rendering to the presentational components in component/
 */
export function ParameterWidgetRenderer({
  parameterName,
  parameterType,
  connectionId,
  seedQuery,
  parentParameterName,
  rangeMin = 0,
  rangeMax = 100,
  rangeStep = 1,
  placeholder,
  className,
}: ParameterWidgetConfig) {
  const parameters = useParameterStore((s) => s.parameters);
  const setParameter = useParameterStore((s) => s.setParameter);
  const clearParameter = useParameterStore((s) => s.clearParameter);

  // ── Parent value (for cascading) ──────────────────────────────────────────
  const parentValue = parentParameterName
    ? String(parameters[parentParameterName]?.value ?? "")
    : undefined;

  const parentParams = useMemo(
    () =>
      parentParameterName && parentValue
        ? { [`param_${parentParameterName}`]: parentValue }
        : {},
    [parentParameterName, parentValue]
  );

  // ── Seed query (select, multi-select, cascading) ──────────────────────────
  const needsSeed =
    parameterType === "select" ||
    parameterType === "multi-select" ||
    parameterType === "cascading-select";

  const cascadingEnabled =
    parameterType !== "cascading-select" ||
    (parentParameterName !== undefined ? !!parentValue : true);

  const { options, loading } = useSeedQuery(
    connectionId,
    seedQuery,
    needsSeed && cascadingEnabled,
    parameterType === "cascading-select" ? parentParams : undefined
  );

  // ── Convenience helpers ───────────────────────────────────────────────────
  const set = useCallback(
    (value: unknown) =>
      setParameter(parameterName, value, "Parameter Selector", parameterName, parameterType, "selector-widget"),
    [parameterName, parameterType, setParameter]
  );

  const clear = useCallback(
    () => clearParameter(parameterName),
    [parameterName, clearParameter]
  );

  // ── Clear cascading child when parent value changes ─────────────────────
  const prevParentValue = useRef(parentValue);
  useEffect(() => {
    if (
      parameterType === "cascading-select" &&
      parentParameterName &&
      prevParentValue.current !== parentValue
    ) {
      prevParentValue.current = parentValue;
      clearParameter(parameterName);
    }
  }, [parameterType, parentParameterName, parentValue, parameterName, clearParameter]);

  // ── Read current value from store ─────────────────────────────────────────
  const currentEntry = parameters[parameterName];

  // ── Render per type ───────────────────────────────────────────────────────
  switch (parameterType) {
    case "text": {
      const textValue = currentEntry ? String(currentEntry.value ?? "") : "";
      return (
        <TextInputParameter
          parameterName={parameterName}
          value={textValue}
          onChange={(v) => (v ? set(v) : clear())}
          placeholder={placeholder}
          className={className}
        />
      );
    }

    case "select": {
      const selectValue = currentEntry ? String(currentEntry.value ?? "") : "";
      return (
        <ParamSelector
          parameterName={parameterName}
          options={options}
          value={selectValue}
          onChange={(v) => (v ? set(v) : clear())}
          placeholder={placeholder}
          loading={loading}
          className={className}
        />
      );
    }

    case "multi-select": {
      const rawValues = currentEntry?.value;
      const multiValues: string[] = Array.isArray(rawValues)
        ? (rawValues as unknown[]).map(String)
        : rawValues
        ? [String(rawValues)]
        : [];
      return (
        <ParamMultiSelector
          parameterName={parameterName}
          options={options}
          values={multiValues}
          onChange={(vals) => (vals.length > 0 ? set(vals) : clear())}
          placeholder={placeholder}
          loading={loading}
          className={className}
        />
      );
    }

    case "date": {
      const dateValue = currentEntry ? String(currentEntry.value ?? "") : "";
      return (
        <DatePickerParameter
          parameterName={parameterName}
          value={dateValue}
          onChange={(v) => (v ? set(v) : clear())}
          className={className}
        />
      );
    }

    case "date-range": {
      // Range stores an object {from, to} in the entry value
      const rangeEntry = currentEntry?.value as { from?: string; to?: string } | undefined;
      const fromVal = rangeEntry?.from ?? "";
      const toVal = rangeEntry?.to ?? "";

      // Convenience: also set the flat `{name}_from` and `{name}_to` parameters
      // so queries can reference $param_{name}_from and $param_{name}_to directly.
      const handleRangeChange = (from: string, to: string) => {
        if (!from && !to) {
          clear();
          clearParameter(`${parameterName}_from`);
          clearParameter(`${parameterName}_to`);
          return;
        }
        set({ from, to });
        setParameter(`${parameterName}_from`, from, "Parameter Selector", `${parameterName}_from`, "date", "selector-widget");
        setParameter(`${parameterName}_to`, to, "Parameter Selector", `${parameterName}_to`, "date", "selector-widget");
      };

      return (
        <DateRangeParameter
          parameterName={parameterName}
          from={fromVal}
          to={toVal}
          onChange={handleRangeChange}
          className={className}
        />
      );
    }

    case "date-relative": {
      const relValue = currentEntry
        ? (currentEntry.value as RelativeDatePreset | "")
        : "";
      const handleRelChange = (preset: RelativeDatePreset | "") => {
        if (!preset) {
          clear();
          clearParameter(`${parameterName}_from`);
          clearParameter(`${parameterName}_to`);
          return;
        }
        set(preset);
        // Also expand to flat _from/_to for query compatibility
        const { from, to } = resolveRelativePreset(preset);
        setParameter(`${parameterName}_from`, from, "Parameter Selector", `${parameterName}_from`, "date", "selector-widget");
        setParameter(`${parameterName}_to`, to, "Parameter Selector", `${parameterName}_to`, "date", "selector-widget");
      };
      return (
        <DateRelativePicker
          parameterName={parameterName}
          value={relValue}
          onChange={handleRelChange}
          className={className}
        />
      );
    }

    case "number-range": {
      const rawRange = currentEntry?.value;
      const rangeValue: [number, number] | null = Array.isArray(rawRange)
        ? [Number(rawRange[0]), Number(rawRange[1])]
        : null;

      const handleRangeChange = (vals: [number, number]) => {
        set(vals);
        // Also set flat _min/_max for direct query use
        setParameter(`${parameterName}_min`, vals[0], "Parameter Selector", `${parameterName}_min`, "number-range", "selector-widget");
        setParameter(`${parameterName}_max`, vals[1], "Parameter Selector", `${parameterName}_max`, "number-range", "selector-widget");
      };

      const handleClear = () => {
        clear();
        clearParameter(`${parameterName}_min`);
        clearParameter(`${parameterName}_max`);
      };

      return (
        <NumberRangeSlider
          parameterName={parameterName}
          min={rangeMin}
          max={rangeMax}
          step={rangeStep}
          value={rangeValue}
          onChange={handleRangeChange}
          onClear={handleClear}
          showInputs
          className={className}
        />
      );
    }

    case "cascading-select": {
      const cascadeValue = currentEntry ? String(currentEntry.value ?? "") : "";
      return (
        <CascadingSelector
          parameterName={parameterName}
          options={options}
          value={cascadeValue}
          onChange={(v) => (v ? set(v) : clear())}
          parentValue={parentValue}
          parentParameterName={parentParameterName}
          loading={loading}
          placeholder={placeholder}
          className={className}
        />
      );
    }

    default:
      return null;
  }
}
