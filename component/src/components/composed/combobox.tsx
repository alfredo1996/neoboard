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
  filterOnLabel,
  HighlightMatch,
  toCmdkValue,
} from "@/components/ui/command";
import {
  invalidControlClasses,
  pickerTriggerClasses,
} from "@/components/ui/control-sizes";
import { useFieldControl } from "@/components/ui/field";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface ComboboxOption {
  value: string;
  label: string;
  disabled?: boolean;
  /** Muted text at the row's right edge (e.g. what kind of thing it is); searchable. */
  hint?: string;
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
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: React.AriaAttributes["aria-invalid"];
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
  ...fieldProps
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const controlProps = useFieldControl(fieldProps);

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
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          {...controlProps}
          className={cn(
            pickerTriggerClasses,
            invalidControlClasses,
            "w-[200px]",
            className,
          )}
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
        <Command filter={filterOnLabel}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList ref={listRef}>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  // Filter on the label so typing the connection name (not the
                  // UUID) finds the item; value stays unique (#1411).
                  value={toCmdkValue(option.value)}
                  keywords={
                    option.hint ? [option.label, option.hint] : [option.label]
                  }
                  disabled={option.disabled}
                  onSelect={() => {
                    onChange?.(option.value === value ? "" : option.value);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <Check
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      value === option.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {option.icon && (
                    <option.icon className="h-4 w-4 shrink-0 opacity-70" />
                  )}
                  <span
                    className={cn(value === option.value && "font-semibold")}
                  >
                    <HighlightMatch text={option.label} query={search} />
                  </span>
                  {option.hint && (
                    <span className="ml-auto pl-2 text-xs text-muted-foreground">
                      {option.hint}
                    </span>
                  )}
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
