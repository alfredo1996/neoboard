"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface CreatableComboboxProps {
  suggestions: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * A combobox that allows both free-text entry and selecting from suggestions.
 * Unlike the standard Combobox, typing a value not in the suggestions list is
 * allowed and immediately calls onChange with the custom text.
 */
function CreatableCombobox({
  suggestions,
  value,
  onChange,
  placeholder = "Type or select...",
  className,
  disabled,
}: CreatableComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState(value);
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  // Keep internal state in sync with controlled value
  React.useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Filter suggestions based on current input
  const filtered = React.useMemo(
    () =>
      suggestions.filter(
        (s) =>
          s.toLowerCase().includes(inputValue.toLowerCase()) && s !== inputValue
      ),
    [suggestions, inputValue]
  );

  // Close dropdown when clicking outside
  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange(newValue);
    setOpen(true);
  }

  function handleSelect(suggestion: string) {
    setInputValue(suggestion);
    onChange(suggestion);
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <input
        role="combobox"
        aria-expanded={open && filtered.length > 0}
        aria-autocomplete="list"
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium",
          "placeholder:text-muted-foreground",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50"
        )}
        value={inputValue}
        onChange={handleInputChange}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        disabled={disabled}
      />
      {open && filtered.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {filtered.map((suggestion) => (
            <li
              key={suggestion}
              role="option"
              aria-selected={suggestion === value}
              className={cn(
                "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none",
                "hover:bg-accent hover:text-accent-foreground",
                suggestion === value && "bg-accent text-accent-foreground"
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(suggestion);
              }}
            >
              {suggestion}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export { CreatableCombobox };
