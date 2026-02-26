"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useParameterStore } from "@/stores/parameter-store";
import type { ParameterType } from "@/stores/parameter-store";
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
 * Named columns 'value' and 'label' take precedence over ordinal positions.
 *
 * Defense-in-depth: `tenantId` is passed in the request body and the server
 * asserts it matches the session tenant — complementing the existing
 * ownership check on the connection itself.
 */
function useSeedQuery(
  connectionId: string | undefined,
  query: string | undefined,
  enabled: boolean,
  extraParams?: Record<string, unknown>,
  tenantId?: string
): { options: ParamSelectorOption[]; loading: boolean } {
  const { data, isLoading } = useQuery<SeedQueryResult>({
    queryKey: ["param-seed", connectionId, query, extraParams, tenantId],
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          connectionId,
          query,
          params: extraParams ?? {},
          ...(tenantId ? { tenantId } : {}),
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
        // Named columns 'value' and 'label' take precedence over ordinal positions.
        // This lets query authors write: RETURN id AS value, name AS label
        const valueKey = ("value" in r) ? "value" : (keys[0] ?? "");
        const labelKey = ("label" in r) ? "label" : (keys[1] ?? valueKey);
        const rawValue = r[valueKey];
        // Store the raw value for type preservation; display uses String()
        const value = String(rawValue ?? "");
        const label = String(r[labelKey] ?? value);
        return { value, label, rawValue };
      }
      return { value: String(row), label: String(row), rawValue: row };
    });
  }, [data]);

  return { options, loading: isLoading };
}

// ─── Debounced text input ────────────────────────────────────────────────────

/**
 * Thin wrapper around TextInputParameter that debounces the onChange callback
 * by 200 ms so that rapid keystrokes don't flood the parameter store.
 */
function DebouncedTextInput({
  parameterName,
  value,
  onChange,
  placeholder,
  className,
}: {
  parameterName: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);

  // Sync draft when the external (store) value changes.
  useEffect(() => {
    setDraft(value);
  }, [value]);

  // Fire onChange after 200 ms of inactivity.
  useEffect(() => {
    const t = setTimeout(() => {
      if (draft !== value) onChange(draft);
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  return (
    <TextInputParameter
      parameterName={parameterName}
      value={draft}
      onChange={(v) => setDraft(v ?? "")}
      placeholder={placeholder}
      className={className}
    />
  );
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
  /** Enable search-as-you-type on select/multi-select (re-queries with $param_search) */
  searchable?: boolean;
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
  searchable = false,
  className,
}: ParameterWidgetConfig) {
  const parameters = useParameterStore((s) => s.parameters);
  const setParameter = useParameterStore((s) => s.setParameter);
  const clearParameter = useParameterStore((s) => s.clearParameter);

  // Read tenantId from the Auth.js session for defense-in-depth tenant scoping
  // on seed query requests. The server independently enforces connection ownership,
  // but passing tenantId allows an additional assertion server-side.
  const { data: session } = useSession();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Auth.js user type is extended at runtime
  const tenantId = (session?.user as any)?.tenantId as string | undefined;

  // ── Searchable: debounced search term ─────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    if (!searchable) return;
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm, searchable]);

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

  const seedExtraParams = useMemo(() => {
    const base = parameterType === "cascading-select" ? parentParams : {};
    if (searchable && debouncedSearch) {
      return { ...base, param_search: debouncedSearch };
    }
    return Object.keys(base).length > 0 ? base : undefined;
  }, [parameterType, parentParams, searchable, debouncedSearch]);

  const { options, loading } = useSeedQuery(
    connectionId,
    seedQuery,
    needsSeed && cascadingEnabled,
    seedExtraParams,
    tenantId
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
        <DebouncedTextInput
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
          onChange={(v) => {
            if (!v) { clear(); return; }
            // Store the raw typed value from the option, fall back to string
            const opt = options.find((o) => o.value === v);
            set(opt?.rawValue !== undefined ? opt.rawValue : v);
          }}
          placeholder={placeholder}
          loading={loading}
          searchable={searchable}
          onSearch={searchable ? setSearchTerm : undefined}
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
          onChange={(vals) => {
            if (vals.length === 0) { clear(); return; }
            // Preserve raw typed values from options
            const rawVals = vals.map((v) => {
              const opt = options.find((o) => o.value === v);
              return opt?.rawValue !== undefined ? opt.rawValue : v;
            });
            set(rawVals);
          }}
          placeholder={placeholder}
          loading={loading}
          searchable={searchable}
          onSearch={searchable ? setSearchTerm : undefined}
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
        if (from) {
          setParameter(`${parameterName}_from`, from, "Parameter Selector", `${parameterName}_from`, "date", "selector-widget");
        } else {
          clearParameter(`${parameterName}_from`);
        }
        if (to) {
          setParameter(`${parameterName}_to`, to, "Parameter Selector", `${parameterName}_to`, "date", "selector-widget");
        } else {
          clearParameter(`${parameterName}_to`);
        }
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
          return;
        }
        // Store only the preset key (e.g. "last_7_days").
        // _from/_to are resolved dynamically at query-execution time by
        // useWidgetQuery so they always reflect today's date, not the date
        // the user clicked the preset.
        set(preset);
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
          onChange={(v) => {
            if (!v) { clear(); return; }
            const opt = options.find((o) => o.value === v);
            set(opt?.rawValue !== undefined ? opt.rawValue : v);
          }}
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
