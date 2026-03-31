"use client";

import { DateRangeParameter } from "@neoboard/components";
import type { ParamActions } from "./use-param-actions";

interface ParamDateRangeProps {
  parameterName: string;
  actions: ParamActions;
  className?: string;
}

export function ParamDateRange({
  parameterName,
  actions,
  className,
}: ParamDateRangeProps) {
  const rangeEntry = actions.currentEntry?.value as
    | { from?: string; to?: string }
    | undefined;
  const fromVal = rangeEntry?.from ?? "";
  const toVal = rangeEntry?.to ?? "";

  const handleChange = (from: string, to: string) => {
    if (!from && !to) {
      actions.clear();
      actions.clearCompanion("from");
      actions.clearCompanion("to");
      return;
    }
    actions.set({ from, to });
    if (from) {
      actions.setCompanion("from", from, "date");
    } else {
      actions.clearCompanion("from");
    }
    if (to) {
      actions.setCompanion("to", to, "date");
    } else {
      actions.clearCompanion("to");
    }
  };

  return (
    <DateRangeParameter
      parameterName={parameterName}
      from={fromVal}
      to={toVal}
      onChange={handleChange}
      className={className}
    />
  );
}
