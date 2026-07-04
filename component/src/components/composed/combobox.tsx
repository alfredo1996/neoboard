"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface ComboboxOption {
  value: string;
  label: string;
  disabled?: boolean;
  /** Optional icon rendered before the label */
  icon?: React.ComponentType<{ className?: string }>;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
}

function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select option...",
  searchPlaceholder = "Search...",
  emptyText = "No option found.",
  className,
  disabled,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);

  // Radix Dialog's scroll-lock (react-remove-scroll) preventDefaults wheel
  // events over this portaled popover, so the option list can't be wheel-
  // scrolled when the Combobox is inside a modal (#1160). Attach a non-passive
  // wheel listener via a ref callback (runs the moment the portaled list
  // mounts) that drives the scroll manually; preventDefault avoids double-
  // scrolling outside a dialog where native scroll still works.
  const listRef = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      if (node.scrollHeight <= node.clientHeight) return;
      node.scrollTop += e.deltaY;
      e.preventDefault();
    };
    node.addEventListener("wheel", onWheel, { passive: false });
  }, []);

  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-[200px] justify-between", className)}
        >
          {selectedOption ? (
            <span className="flex items-center gap-2 truncate">
              {selectedOption.icon && (
                <selectedOption.icon className="h-4 w-4 shrink-0 opacity-70" />
              )}
              {selectedOption.label}
            </span>
          ) : (
            placeholder
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        style={{ width: "var(--radix-popover-trigger-width)" }}
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList ref={listRef}>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  // Use label as the cmdk filter value so typing the connection
                  // name (not the UUID) finds the right item.
                  value={option.label}
                  disabled={option.disabled}
                  onSelect={() => {
                    onChange?.(option.value === value ? "" : option.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      value === option.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {option.icon && (
                    <option.icon className="mr-2 h-4 w-4 shrink-0 opacity-70" />
                  )}
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export { Combobox };
