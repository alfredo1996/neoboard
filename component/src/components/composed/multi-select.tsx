"use client";

import * as React from "react";
import { X, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MultiSelectItem } from "./multi-select-item";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);

  const selectedOptions = options.filter((opt) => value.includes(opt.value));

  const handleToggle = (optionValue: string) => {
    const newValue = value.includes(optionValue)
      ? value.filter((v) => v !== optionValue)
      : [...value, optionValue];
    onChange?.(newValue);
  };

  const handleRemove = (optionValue: string, e: React.SyntheticEvent) => {
    e.stopPropagation();
    onChange?.(value.filter((v) => v !== optionValue));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-[300px] justify-between h-auto min-h-10", className)}
        >
          <div className="flex flex-wrap gap-1 flex-1">
            {selectedOptions.length === 0 && (
              <span className="text-muted-foreground font-normal">
                {placeholder}
              </span>
            )}
            {selectedOptions.slice(0, maxDisplay).map((option) => (
              <Badge key={option.value} variant="secondary" className="text-xs">
                {option.label}
                {/* KNOWN DEFECT (#1283 item 4, tracked separately): this is a
                    <span role="button"> because the trigger is already a
                    <button> and interactive-in-interactive is invalid HTML.
                    But ARIA makes the children of a `button` presentational,
                    so browsers DROP this role and fold the label into the
                    trigger's accessible name. cross-filter-tag.tsx solved this
                    by de-nesting — only the body is a button and the remove
                    control is its sibling. The same restructure is needed
                    here; it is not done yet because the trigger renders the
                    badges inline, which is a larger change. Do NOT treat this
                    comment as a statement that the pattern is correct. */}
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Remove ${option.label}`}
                  className="ml-1 cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  onClick={(e) => handleRemove(option.value, e)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleRemove(option.value, e);
                    }
                  }}
                >
                  <X className="h-3 w-3" />
                </span>
              </Badge>
            ))}
            {selectedOptions.length > maxDisplay && (
              <Badge variant="secondary" className="text-xs">
                +{selectedOptions.length - maxDisplay} more
              </Badge>
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          {/* #1284: cmdk never sets aria-multiselectable, so this prop does
              pass through (unlike role/aria-selected on the items). */}
          <CommandList aria-multiselectable="true">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <MultiSelectItem
                  key={option.value}
                  // NOTE: still the machine value — cmdk then filters on UUIDs
                  // rather than labels. That is #1411 / #1284 defect 2, fixed
                  // there, not here.
                  value={option.value}
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
