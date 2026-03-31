"use client";

import { DatePickerParameter } from "@neoboard/components";
import type { ParamActions } from "./use-param-actions";

interface ParamDateProps {
  parameterName: string;
  actions: ParamActions;
  className?: string;
}

export function ParamDate({
  parameterName,
  actions,
  className,
}: ParamDateProps) {
  const dateValue = actions.currentEntry
    ? String(actions.currentEntry.value ?? "")
    : "";
  return (
    <DatePickerParameter
      parameterName={parameterName}
      value={dateValue}
      onChange={(v) => (v ? actions.set(v) : actions.clear())}
      className={className}
    />
  );
}
