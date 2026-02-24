"use client";

import * as React from "react";
import { X, Check, ChevronsUpDown } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  placeholder = "Select values…",
  loading = false,
  maxDisplay = 3,
  className,
}: ParamMultiSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const labelId = `param-multi-label-${parameterName}`;

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
    return (
      <div className={cn("space-y-1.5", className)}>
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between">
        <Label id={labelId} className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {parameterName}
        </Label>
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
            className="w-full justify-between h-auto min-h-9 px-3"
          >
            <div className="flex flex-wrap gap-1 flex-1 min-w-0">
              {selectedOptions.length === 0 && (
                <span className="text-muted-foreground font-normal text-sm">
                  {placeholder}
                </span>
              )}
              {selectedOptions.slice(0, maxDisplay).map((opt) => (
                <Badge key={opt.value} variant="secondary" className="text-xs py-0">
                  {opt.label}
                  <button
                    type="button"
                    className="ml-1 rounded-full outline-none ring-offset-background focus:ring-1 focus:ring-ring"
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
            <CommandInput placeholder="Search…" />
            <CommandList>
              <CommandEmpty>No options found.</CommandEmpty>
              <CommandGroup>
                {options.map((opt) => (
                  <CommandItem
                    key={opt.value}
                    value={opt.value}
                    onSelect={() => handleToggle(opt.value)}
                  >
                    <div
                      className={cn(
                        "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary shrink-0",
                        values.includes(opt.value)
                          ? "bg-primary text-primary-foreground"
                          : "opacity-50"
                      )}
                    >
                      {values.includes(opt.value) && <Check className="h-3 w-3" />}
                    </div>
                    {opt.label}
                  </CommandItem>
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
