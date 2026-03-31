"use client";

import { ParamMultiSelector } from "@neoboard/components";
import type { ParamActions } from "./use-param-actions";
import type { SeedQueryResult } from "./use-seed-query-options";

interface ParamMultiSelectProps {
  parameterName: string;
  actions: ParamActions;
  seed: SeedQueryResult;
  searchable: boolean;
  placeholder?: string;
  className?: string;
}

export function ParamMultiSelect({
  parameterName,
  actions,
  seed,
  searchable,
  placeholder,
  className,
}: ParamMultiSelectProps) {
  const rawValues = actions.currentEntry?.value;
  const multiValues: string[] = Array.isArray(rawValues)
    ? (rawValues as unknown[]).map(String)
    : rawValues
      ? [String(rawValues)]
      : [];

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
        const rawVals = vals.map((v) => {
          const opt = seed.options.find((o) => o.value === v);
          return opt?.rawValue !== undefined ? opt.rawValue : v;
        });
        actions.set(rawVals);
      }}
      placeholder={placeholder}
      loading={seed.loading}
      searchable={searchable}
      onSearch={searchable ? seed.setSearchTerm : undefined}
      className={className}
    />
  );
}
