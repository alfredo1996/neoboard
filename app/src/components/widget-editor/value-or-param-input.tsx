"use client";

import {
  CreatableCombobox,
  Input,
} from "@neoboard/components";

interface ValueOrParamInputProps {
  parameterRef: string | undefined;
  onParamRefChange: (ref: string | undefined) => void;
  value: string | number;
  onValueChange: (v: string | number) => void;
  parameterSuggestions: string[];
  inputType?: "text" | "number";
  placeholder?: string;
}

/**
 * Smart input that auto-detects whether the user is entering a literal value
 * or a dashboard parameter reference. Shows parameter suggestions via a
 * combobox; selecting a suggestion sets parameterRef. Typing a literal value
 * clears parameterRef and sets value directly.
 */
export function ValueOrParamInput({
  parameterRef,
  onParamRefChange,
  value,
  onValueChange,
  parameterSuggestions,
  inputType = "number",
  placeholder = "0",
}: ValueOrParamInputProps) {
  // When there are parameter suggestions, show a combobox that allows
  // both selecting a parameter and typing a literal value.
  if (parameterSuggestions.length > 0) {
    const displayValue = parameterRef !== undefined ? parameterRef : String(value);
    return (
      <CreatableCombobox
        suggestions={parameterSuggestions}
        value={displayValue}
        onChange={(v) => {
          if (parameterSuggestions.includes(v)) {
            // User selected a known parameter
            onParamRefChange(v);
          } else {
            // User typed a literal value
            onParamRefChange(undefined);
            onValueChange(inputType === "number" && v !== "" ? Number(v) : v);
          }
        }}
        placeholder={placeholder}
      />
    );
  }

  // No parameter suggestions — plain input
  return (
    <Input
      type={inputType}
      value={parameterRef !== undefined ? parameterRef : value}
      onChange={(e) => {
        onParamRefChange(undefined);
        onValueChange(
          inputType === "number" ? Number(e.target.value) : e.target.value,
        );
      }}
      placeholder={placeholder}
    />
  );
}
