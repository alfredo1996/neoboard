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
import { cn } from "@/lib/utils";
import { ParamWidgetSkeleton } from "./param-widget-skeleton";

export interface ParamSelectorOption {
  label: string;
  value: string;
  /** Original typed value from the DB query, preserved for type-safe parameter passing. */
  rawValue?: unknown;
}

/**
 * Internal sentinel value used for the disabled "No options available"
 * placeholder. Namespaced so it cannot collide with a legitimate DB
 * value (compare with the previously-used bare `__empty__`, which a
 * real query could plausibly return). Exported for the collision check
 * in the render path.
 */
export const PARAM_SELECTOR_EMPTY_SENTINEL = "__nb_param_selector_empty__";

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
  /**
   * Current value of the parent parameter this select cascades from.
   * Absent while `parentParameterName` is set = the cascade is not ready yet.
   */
  parentValue?: string;
  /**
   * Name of the parent parameter whose value seeds this select's options.
   * Setting it turns a plain select into a cascading one: the control is
   * disabled until the parent has a value.
   */
  parentParameterName?: string;
  className?: string;
}

/**
 * Single-select dropdown for a parameter widget seeded from a DB query.
 * Pure presentational — receives options as props, calls onChange.
 *
 * When `searchable` is true, renders a Command popover with a search input
 * that calls `onSearch` for server-side filtering.
 *
 * When `parentParameterName` is set the select is *cascading*: it stays
 * disabled, and prompts for the parent, until `parentValue` arrives. This
 * replaces the former separate `CascadingSelector`, which was the same
 * component minus the search input (#1360).
 */
function ParamSelector({
  parameterName,
  options,
  value,
  onChange,
  placeholder,
  loading = false,
  searchable = false,
  onSearch,
  parentValue,
  parentParameterName,
  className,
}: ParamSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const labelId = `param-select-label-${parameterName}`;

  // Truthiness, not `!== undefined`: the widget editor's parent-name input
  // writes "" when the user clears it, and an empty name is no parent — the
  // alternative is a select stuck asking for a parent with no name (#1360).
  const isWaitingForParent = !!parentParameterName && !parentValue;

  // The parent was cleared while the popover was open. Close it so the typed
  // search term dies with the CommandInput rather than surviving as a stale
  // filter over the option set that loads for the next parent.
  // Adjusting state during render, per
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  if (open && isWaitingForParent) setOpen(false);

  if (loading) {
    return <ParamWidgetSkeleton className={className} />;
  }

  const selectedLabel = options.find((o) => o.value === value)?.label;

  const resolvedPlaceholder =
    placeholder ??
    (isWaitingForParent
      ? `Select ${parentParameterName} first…`
      : "Select a value…");

  const label = (
    <Label
      id={labelId}
      className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
    >
      {parameterName}
      {parentParameterName && (
        <span className="ml-1 text-[10px] normal-case font-normal opacity-60">
          (depends on {parentParameterName})
        </span>
      )}
    </Label>
  );

  const clearButton = value && (
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
  );

  // Searchable mode: command popover with server-side search
  if (searchable) {
    return (
      <div className={cn("space-y-1.5", className)}>
        {label}
        <div className="flex items-center gap-1">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                aria-labelledby={labelId}
                disabled={isWaitingForParent}
                className="flex-1 justify-between"
              >
                {selectedLabel ?? (
                  <span className="text-muted-foreground font-normal">
                    {resolvedPlaceholder}
                  </span>
                )}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full min-w-[200px] p-0" align="start">
              <Command>
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
                            opt.value === value ? "opacity-100" : "opacity-0",
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
          {clearButton}
        </div>
      </div>
    );
  }

  // Default: standard radix Select
  return (
    <div className={cn("space-y-1.5", className)}>
      {label}
      <div className="flex items-center gap-1">
        <Select
          value={value}
          onValueChange={onChange}
          disabled={isWaitingForParent}
        >
          <SelectTrigger className="flex-1" aria-labelledby={labelId}>
            <SelectValue placeholder={resolvedPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            {!loading && options.length === 0 && (
              <SelectItem
                value={PARAM_SELECTOR_EMPTY_SENTINEL}
                disabled
                className="text-muted-foreground text-sm"
              >
                No options available
              </SelectItem>
            )}
            {options.map((opt) => {
              if (
                process.env.NODE_ENV !== "production" &&
                opt.value === PARAM_SELECTOR_EMPTY_SENTINEL
              ) {
                console.warn(
                  `[ParamSelector] option value collides with the internal ` +
                    `empty-placeholder sentinel (${PARAM_SELECTOR_EMPTY_SENTINEL}). ` +
                    `Rename your value to avoid undefined render behavior.`,
                );
              }
              return (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        {clearButton}
      </div>
    </div>
  );
}

export { ParamSelector };
