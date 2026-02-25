"use client";

import * as React from "react";
import { X, Check, ChevronsUpDown } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface ParamSelectorOption {
  label: string;
  value: string;
  /** Original typed value from the DB query, preserved for type-safe parameter passing. */
  rawValue?: unknown;
}

export interface ParamSelectorProps {
  parameterName: string;
  options: ParamSelectorOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  loading?: boolean;
  /** Enable search-as-you-type (shows a search input that triggers onSearch). */
  searchable?: boolean;
  /** Called with the search term as the user types (for server-side filtering). */
  onSearch?: (term: string) => void;
  className?: string;
}

/**
 * Single-select dropdown for a parameter widget seeded from a DB query.
 * Pure presentational — receives options as props, calls onChange.
 *
 * When `searchable` is true, renders a Command popover with a search input
 * that calls `onSearch` for server-side filtering.
 */
function ParamSelector({
  parameterName,
  options,
  value,
  onChange,
  placeholder = "Select a value…",
  loading = false,
  searchable = false,
  onSearch,
  className,
}: ParamSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const labelId = `param-select-label-${parameterName}`;

  if (loading) {
    return (
      <div className={cn("space-y-1.5", className)}>
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  const selectedLabel = options.find((o) => o.value === value)?.label;

  // Searchable mode: command popover with server-side search
  if (searchable) {
    return (
      <div className={cn("space-y-1.5", className)}>
        <Label id={labelId} className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {parameterName}
        </Label>
        <div className="flex items-center gap-1">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                aria-labelledby={labelId}
                className="flex-1 justify-between"
              >
                {selectedLabel ?? <span className="text-muted-foreground font-normal">{placeholder}</span>}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full min-w-[200px] p-0" align="start">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="Search…"
                  onValueChange={(term) => onSearch?.(term)}
                />
                <CommandList>
                  <CommandEmpty>No options found.</CommandEmpty>
                  <CommandGroup>
                    {options.map((opt) => (
                      <CommandItem
                        key={opt.value}
                        value={opt.value}
                        onSelect={() => {
                          onChange(opt.value === value ? "" : opt.value);
                          setOpen(false);
                        }}
                      >
                        <div
                          className={cn(
                            "mr-2 flex h-4 w-4 items-center justify-center shrink-0",
                            opt.value === value ? "opacity-100" : "opacity-0"
                          )}
                        >
                          <Check className="h-3 w-3" />
                        </div>
                        {opt.label}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => onChange("")}
              aria-label={`Clear ${parameterName}`}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Default: standard radix Select
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label id={labelId} className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {parameterName}
      </Label>
      <div className="flex items-center gap-1">
        <Select
          value={value}
          onValueChange={onChange}
          aria-labelledby={labelId}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => onChange("")}
            aria-label={`Clear ${parameterName}`}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

export { ParamSelector };
