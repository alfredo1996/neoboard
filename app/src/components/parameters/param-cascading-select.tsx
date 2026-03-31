"use client";

import { CascadingSelector } from "@neoboard/components";
import type { ParamActions } from "./use-param-actions";
import type { SeedQueryResult } from "./use-seed-query-options";

interface ParamCascadingSelectProps {
  parameterName: string;
  actions: ParamActions;
  seed: SeedQueryResult;
  parentParameterName?: string;
  placeholder?: string;
  className?: string;
}

export function ParamCascadingSelect({
  parameterName,
  actions,
  seed,
  parentParameterName,
  placeholder,
  className,
}: ParamCascadingSelectProps) {
  const cascadeValue = actions.currentEntry
    ? String(actions.currentEntry.value ?? "")
    : "";
  return (
    <CascadingSelector
      parameterName={parameterName}
      options={seed.options}
      value={cascadeValue}
      onChange={(v) => {
        if (!v) {
          actions.clear();
          return;
        }
        const opt = seed.options.find((o) => o.value === v);
        actions.set(opt?.rawValue !== undefined ? opt.rawValue : v);
      }}
      parentValue={seed.parentValue}
      parentParameterName={parentParameterName}
      loading={seed.loading}
      placeholder={placeholder}
      className={className}
    />
  );
}
