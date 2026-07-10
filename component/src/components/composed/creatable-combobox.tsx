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
  id?: string;
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
  id,
}: CreatableComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState(value);
  // Index of the keyboard-highlighted suggestion (-1 = none highlighted).
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const listboxId = React.useId();

  // Keep internal state in sync with controlled value
  React.useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Filter suggestions based on current input
  const filtered = React.useMemo(
    () =>
      suggestions.filter(
        (s) =>
          s.toLowerCase().includes(inputValue.toLowerCase()) &&
          s !== inputValue,
      ),
    [suggestions, inputValue],
  );

  // Close dropdown when clicking outside
  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
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
    // The suggestion list just changed — drop any stale highlight.
    setActiveIndex(-1);
  }

  function handleSelect(suggestion: string) {
    setInputValue(suggestion);
    onChange(suggestion);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const canNavigate = filtered.length > 0;
    switch (e.key) {
      case "ArrowDown":
        if (!canNavigate) return;
        e.preventDefault();
        setOpen(true);
        setActiveIndex((i) => (i + 1) % filtered.length);
        break;
      case "ArrowUp":
        if (!canNavigate) return;
        e.preventDefault();
        setOpen(true);
        setActiveIndex((i) => (i <= 0 ? filtered.length - 1 : i - 1));
        break;
      case "Enter":
        if (open && activeIndex >= 0 && activeIndex < filtered.length) {
          e.preventDefault();
          handleSelect(filtered[activeIndex]);
        }
        break;
      case "Escape":
        if (open) {
          e.preventDefault();
          setOpen(false);
          setActiveIndex(-1);
        }
        break;
      default:
        break;
    }
  }

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <input
        id={id}
        role="combobox"
        aria-expanded={open && filtered.length > 0}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-activedescendant={
          open && activeIndex >= 0 && activeIndex < filtered.length
            ? `${listboxId}-opt-${activeIndex}`
            : undefined
        }
        onKeyDown={handleKeyDown}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-[color,border-color,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium",
          "placeholder:text-muted-foreground",
          "hover:border-[hsl(var(--border-strong))]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:border-[hsl(var(--ring))]",
          "disabled:cursor-not-allowed disabled:opacity-50",
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
          id={listboxId}
          className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {filtered.map((suggestion, index) => (
            <li
              key={suggestion}
              id={`${listboxId}-opt-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className={cn(
                "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none",
                "hover:bg-accent hover:text-accent-foreground",
                (index === activeIndex || suggestion === value) &&
                  "bg-accent text-accent-foreground",
              )}
              onMouseEnter={() => setActiveIndex(index)}
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
