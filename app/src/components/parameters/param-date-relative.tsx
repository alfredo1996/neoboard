"use client";

import {
  DateRelativePicker,
  type RelativeDatePreset,
} from "@neoboard/components";
import type { ParamActions } from "./use-param-actions";

interface ParamDateRelativeProps {
  parameterName: string;
  actions: ParamActions;
  className?: string;
}

export function ParamDateRelative({
  parameterName,
  actions,
  className,
}: ParamDateRelativeProps) {
  const relValue = actions.currentEntry
    ? (actions.currentEntry.value as RelativeDatePreset | "")
    : "";

  const handleChange = (preset: RelativeDatePreset | "") => {
    if (!preset) {
      actions.clear();
      return;
    }
    actions.set(preset);
  };

  return (
    <DateRelativePicker
      parameterName={parameterName}
      value={relValue}
      onChange={handleChange}
      className={className}
    />
  );
}
