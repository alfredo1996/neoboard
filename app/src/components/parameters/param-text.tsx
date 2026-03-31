"use client";

import { DebouncedTextInput } from "../debounced-text-input";
import type { ParamActions } from "./use-param-actions";

interface ParamTextProps {
  parameterName: string;
  actions: ParamActions;
  placeholder?: string;
  className?: string;
}

export function ParamText({
  parameterName,
  actions,
  placeholder,
  className,
}: ParamTextProps) {
  const textValue = actions.currentEntry
    ? String(actions.currentEntry.value ?? "")
    : "";
  return (
    <DebouncedTextInput
      parameterName={parameterName}
      value={textValue}
      onChange={(v) => (v ? actions.set(v) : actions.clear())}
      placeholder={placeholder}
      className={className}
    />
  );
}
