"use client";

import {
  Button,
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
 * Paired Value / Parameter toggle with either a CreatableCombobox (parameter
 * mode) or a plain Input (value mode). Used inside styling rules wherever the
 * user can choose between a literal value and a dashboard parameter reference.
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
  return (
    <>
      <div className="flex items-center gap-2 mb-2">
        <Button
          type="button"
          variant={parameterRef === undefined ? "default" : "outline"}
          size="sm"
          onClick={() => onParamRefChange(undefined)}
        >
          Value
        </Button>
        <Button
          type="button"
          variant={parameterRef !== undefined ? "default" : "outline"}
          size="sm"
          onClick={() => onParamRefChange("")}
        >
          Parameter
        </Button>
      </div>
      {parameterRef !== undefined ? (
        <CreatableCombobox
          suggestions={parameterSuggestions}
          value={parameterRef}
          onChange={onParamRefChange}
          placeholder="param_name"
        />
      ) : (
        <Input
          type={inputType}
          value={value}
          onChange={(e) =>
            onValueChange(
              inputType === "number" ? Number(e.target.value) : e.target.value,
            )
          }
          placeholder={placeholder}
        />
      )}
    </>
  );
}
