"use client";

import * as React from "react";
import { X, ChevronsUpDown } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";
import { ParamWidgetSkeleton } from "./param-widget-skeleton";
import { MultiSelectItem } from "../multi-select-item";

export interface ParamMultiSelectorOption {
  label: string;
  value: string;
}

export interface ParamMultiSelectorProps {
  parameterName: string;
  options: ParamMultiSelectorOption[];
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  loading?: boolean;
  maxDisplay?: number;
  /** Enable search-as-you-type (triggers onSearch for server-side filtering). */
  searchable?: boolean;
  /** Called with the search term as the user types (for server-side filtering). */
  onSearch?: (term: string) => void;
  /**
   * Current value of the parent parameter this multi-select cascades from.
   * Absent while `parentParameterName` is set = the cascade is not ready yet.
   */
  parentValue?: string;
  /**
   * Name of the parent parameter whose value seeds this multi-select's
   * options. Setting it makes the widget cascading: it stays disabled until
   * the parent has a value. Mirrors `ParamSelector` — cascading is a
   * configuration of select, single or multi, not a widget type (#1360).
   */
  parentParameterName?: string;
  className?: string;
}

/**
 * Multi-select dropdown for a parameter widget seeded from a DB query.
 * Pure presentational — receives options as props, calls onChange.
 */
function ParamMultiSelector({
  parameterName,
  options,
  values,
  onChange,
  placeholder,
  loading = false,
  maxDisplay = 3,
  searchable = false,
  onSearch,
  parentValue,
  parentParameterName,
  className,
}: ParamMultiSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const labelId = `param-multi-label-${parameterName}`;

  // Truthiness, not `!== undefined`: the editor's parent-name input writes ""
  // when cleared, and an empty name is no parent (#1360).
  const isWaitingForParent = !!parentParameterName && !parentValue;

  // The parent was cleared while the popover was open — close it so the typed
  // search term dies with the CommandInput instead of surviving as a stale
  // filter over the next parent's option set.
  if (open && isWaitingForParent) setOpen(false);

  const resolvedPlaceholder =
    placeholder ??
    (isWaitingForParent
      ? `Select ${parentParameterName} first…`
      : "Select values…");

  // The dependency hint is a DESCRIPTION, not part of the name — putting it in
  // the <Label> would embed another control's name in this one's (#1360).
  const hintId = parentParameterName ? `${labelId}-hint` : undefined;

  const selectedOptions = options.filter((opt) => values.includes(opt.value));

  const handleToggle = (optionValue: string) => {
    const next = values.includes(optionValue)
      ? values.filter((v) => v !== optionValue)
      : [...values, optionValue];
    onChange(next);
  };

  const handleRemoveBadge = (optionValue: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(values.filter((v) => v !== optionValue));
  };

  if (loading) {
    return <ParamWidgetSkeleton labelWidth="w-24" className={className} />;
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between">
        <div>
          <Label
            id={labelId}
            className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
          >
            {parameterName}
          </Label>
          {parentParameterName && (
            <span
              id={hintId}
              className="ml-1 text-[10px] normal-case font-normal opacity-60 text-muted-foreground"
            >
              (depends on {parentParameterName})
            </span>
          )}
        </div>
        {values.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-5 px-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => onChange([])}
          >
            <X className="h-3 w-3 mr-0.5" />
            Clear
          </Button>
        )}
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-labelledby={labelId}
            aria-describedby={hintId}
            disabled={isWaitingForParent}
            className="w-full justify-between h-auto min-h-9 px-3"
          >
            <div className="flex flex-wrap gap-1 flex-1 min-w-0">
              {selectedOptions.length === 0 && (
                <span className="text-muted-foreground font-normal text-sm">
                  {resolvedPlaceholder}
                </span>
              )}
              {selectedOptions.slice(0, maxDisplay).map((opt) => (
                <Badge
                  key={opt.value}
                  variant="secondary"
                  className="text-xs py-0"
                >
                  {opt.label}
                  <button
                    type="button"
                    className="ml-1 rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    onClick={(e) => handleRemoveBadge(opt.value, e)}
                    aria-label={`Remove ${opt.label}`}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              ))}
              {selectedOptions.length > maxDisplay && (
                <Badge variant="secondary" className="text-xs py-0">
                  +{selectedOptions.length - maxDisplay}
                </Badge>
              )}
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full min-w-[200px] p-0" align="start">
          <Command>
            {/*
              CommandInput only renders when `searchable` is true. The
              previous version always rendered the input but stripped its
              `onValueChange` when non-searchable — leaving a visible-but-
              inert search field that did nothing to the option list.
            */}
            {searchable && (
              <CommandInput
                placeholder="Search…"
                onValueChange={(term) => onSearch?.(term)}
              />
            )}
            {/* #1283: options carry aria-checked, so the listbox must say
                multiple may be checked at once. */}
            <CommandList aria-multiselectable="true">
              <CommandEmpty>No options found.</CommandEmpty>
              <CommandGroup>
                {options.map((opt) => (
                  <MultiSelectItem
                    key={opt.value}
                    // Machine value retained — the label-vs-value filtering
                    // fix is #1411 / #1284 defect 2, not this change.
                    value={opt.value}
                    isSelected={values.includes(opt.value)}
                    onToggle={() => handleToggle(opt.value)}
                  >
                    {opt.label}
                  </MultiSelectItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export { ParamMultiSelector };
