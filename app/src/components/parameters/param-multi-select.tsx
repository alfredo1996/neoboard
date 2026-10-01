"use client";

import { ParamMultiSelector } from "@neoboard/components";
import {
  rawValueOf,
  useTypedSelection,
  type ParamActions,
} from "./use-param-actions";
import type { SeedQueryResult } from "./use-seed-query-options";
import { SeedQueryError } from "./seed-query-error";

interface ParamMultiSelectProps {
  parameterName: string;
  actions: ParamActions;
  seed: SeedQueryResult;
  searchable: boolean;
  /** Set to make this a cascading multi-select — gated on the named parent. */
  parentParameterName?: string;
  placeholder?: string;
  className?: string;
}

export function ParamMultiSelect({
  parameterName,
  actions,
  seed,
  searchable,
  parentParameterName,
  placeholder,
  className,
}: ParamMultiSelectProps) {
  useTypedSelection(actions, seed.options);
  const rawValues = actions.currentEntry?.value;
  const multiValues: string[] = Array.isArray(rawValues)
    ? (rawValues as unknown[]).map(String)
    : rawValues
      ? [String(rawValues)]
      : [];

  if (seed.error) {
    return <SeedQueryError error={seed.error} onRetry={seed.refetch} />;
  }
  return (
    <ParamMultiSelector
      parameterName={parameterName}
      options={seed.options}
      values={multiValues}
      onChange={(vals) => {
        if (vals.length === 0) {
          actions.clear();
          return;
        }
        // A stored item keeps its type: its option may not be loaded (#2124).
        const stored: unknown[] = [rawValues].flat();
        actions.set(
          vals.map(
            (v) =>
              stored.find((p) => String(p) === v) ??
              rawValueOf(v, seed.options),
          ),
        );
      }}
      placeholder={placeholder}
      loading={seed.loading}
      searchable={searchable}
      onSearch={searchable ? seed.setSearchTerm : undefined}
      serverFiltered={seed.serverFiltered}
      parentValue={seed.parentValue}
      parentParameterName={parentParameterName}
      className={className}
    />
  );
}
