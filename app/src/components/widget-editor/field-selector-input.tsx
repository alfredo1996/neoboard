"use client";

import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@neoboard/components";

interface FieldSelectorInputProps {
  value: string;
  onChange: (value: string) => void;
  fields: string[];
  label: string;
  placeholder?: string;
}

/**
 * Shows a Select dropdown when fields are available, falls back to a plain
 * Input when no field metadata is loaded yet.
 */
export function FieldSelectorInput({
  value,
  onChange,
  fields,
  label,
  placeholder = "Column name",
}: FieldSelectorInputProps) {
  if (fields.length > 0) {
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {fields.map((f) => (
            <SelectItem key={f} value={f}>
              {f}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
}
