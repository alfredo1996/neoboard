"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { MultiSelectField } from "./multi-select-field";
import { MultiSelectItem } from "./multi-select-item";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandList,
  filterOnLabel,
  toCmdkValue,
} from "@/components/ui/command";
import { useFieldControl } from "@/components/ui/field";
import { Popover, PopoverContent } from "@/components/ui/popover";

export interface MultiSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface MultiSelectProps {
  options: MultiSelectOption[];
  value?: string[];
  onChange?: (value: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
  maxDisplay?: number;
  id?: string;
  "aria-describedby"?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-invalid"?: React.AriaAttributes["aria-invalid"];
  /**
   * Optional per-option renderer for the dropdown list — useful for adding
   * inline badges or secondary text (e.g. widget title + chart-type badge).
   * Falls back to `option.label` when not provided.
   */
  renderOption?: (option: MultiSelectOption) => React.ReactNode;
}

function MultiSelect({
  options,
  value = [],
  onChange,
  placeholder = "Select options...",
  searchPlaceholder = "Search...",
  emptyText = "No option found.",
  className,
  disabled,
  maxDisplay = 3,
  renderOption,
  ...fieldProps
}: MultiSelectProps) {
  const controlProps = useFieldControl(fieldProps);
  const [open, setOpen] = React.useState(false);

  const selectedOptions = options.filter((opt) => value.includes(opt.value));

  const handleToggle = (optionValue: string) => {
    const newValue = value.includes(optionValue)
      ? value.filter((v) => v !== optionValue)
      : [...value, optionValue];
    onChange?.(newValue);
  };

  const handleRemove = (optionValue: string) => {
    onChange?.(value.filter((v) => v !== optionValue));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <MultiSelectField
        {...controlProps}
        aria-expanded={open}
        disabled={disabled}
        selected={selectedOptions}
        maxDisplay={maxDisplay}
        placeholder={placeholder}
        onRemove={handleRemove}
        padX="px-2.5"
        className={cn(
          "w-[300px] border-input hover:border-input-hover has-[[role=combobox]:disabled]:hover:border-input has-[[role=combobox]:focus-visible]:border-ring has-[[role=combobox]:focus-visible]:ring-offset-1",
          className,
        )}
      />
      <PopoverContent className="w-[300px] p-0">
        <Command filter={filterOnLabel}>
          <CommandInput placeholder={searchPlaceholder} />
          {/* #1284: cmdk never sets aria-multiselectable, so this prop does
              pass through (unlike role/aria-selected on the items). */}
          <CommandList aria-multiselectable="true">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <MultiSelectItem
                  key={option.value}
                  value={toCmdkValue(option.value)}
                  keywords={[option.label]}
                  isSelected={value.includes(option.value)}
                  disabled={option.disabled}
                  onToggle={() => handleToggle(option.value)}
                >
                  {renderOption ? renderOption(option) : option.label}
                </MultiSelectItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export { MultiSelect };
