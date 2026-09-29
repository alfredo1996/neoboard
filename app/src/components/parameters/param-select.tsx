"use client";

import { ParamSelector } from "@neoboard/components";
import {
  rawValueOf,
  useTypedSelection,
  type ParamActions,
} from "./use-param-actions";
import type { SeedQueryResult } from "./use-seed-query-options";
import { SeedQueryError } from "./seed-query-error";

interface ParamSelectProps {
  parameterName: string;
  actions: ParamActions;
  seed: SeedQueryResult;
  searchable: boolean;
  /** Set to make this a cascading select — gated on the named parent. */
  parentParameterName?: string;
  placeholder?: string;
  className?: string;
}

export function ParamSelect({
  parameterName,
  actions,
  seed,
  searchable,
  parentParameterName,
  placeholder,
  className,
}: ParamSelectProps) {
  useTypedSelection(actions, seed.options);
  const selectValue = actions.currentEntry
    ? String(actions.currentEntry.value ?? "")
    : "";
  if (seed.error) {
    return <SeedQueryError error={seed.error} onRetry={seed.refetch} />;
  }
  return (
    <ParamSelector
      parameterName={parameterName}
      options={seed.options}
      value={selectValue}
      onChange={(v) => {
        if (!v) {
          actions.clear();
          return;
        }
        actions.set(rawValueOf(v, seed.options));
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
