"use client";

import { ParamSelector } from "@neoboard/components";
import type { ParamActions } from "./use-param-actions";
import type { SeedQueryResult } from "./use-seed-query-options";

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
  const selectValue = actions.currentEntry
    ? String(actions.currentEntry.value ?? "")
    : "";
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
        const opt = seed.options.find((o) => o.value === v);
        actions.set(opt?.rawValue !== undefined ? opt.rawValue : v);
      }}
      placeholder={placeholder}
      loading={seed.loading}
      searchable={searchable}
      onSearch={searchable ? seed.setSearchTerm : undefined}
      parentValue={seed.parentValue}
      parentParameterName={parentParameterName}
      className={className}
    />
  );
}
