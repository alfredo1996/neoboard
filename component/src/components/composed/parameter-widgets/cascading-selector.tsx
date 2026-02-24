"use client";

import * as React from "react";
import { X, RefreshCw } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface CascadingSelectorOption {
  label: string;
  value: string;
}

export interface CascadingSelectorProps {
  parameterName: string;
  options: CascadingSelectorOption[];
  value: string;
  onChange: (value: string) => void;
  /** The current value of the parent parameter (triggers re-fetch upstream) */
  parentValue?: string;
  /** Name of the parent parameter, shown in the placeholder when absent */
  parentParameterName?: string;
  loading?: boolean;
  placeholder?: string;
  className?: string;
}

/**
 * Cascading selector parameter widget.
 * Re-fetches its option list when the parent parameter changes (wired by the
 * ParameterWidgetRenderer in app/). Pure presentational component.
 */
function CascadingSelector({
  parameterName,
  options,
  value,
  onChange,
  parentValue,
  parentParameterName,
  loading = false,
  placeholder,
  className,
}: CascadingSelectorProps) {
  const labelId = `param-cascade-label-${parameterName}`;

  const isWaitingForParent = parentParameterName !== undefined && !parentValue;

  const resolvedPlaceholder =
    placeholder ??
    (isWaitingForParent
      ? `Select ${parentParameterName} first…`
      : "Select a value…");

  if (loading) {
    return (
      <div className={cn("space-y-1.5", className)}>
        <Skeleton className="h-3 w-24" />
        <div className="flex items-center gap-1">
          <Skeleton className="flex-1 h-9" />
          <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label id={labelId} className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {parameterName}
        {parentParameterName && (
          <span className="ml-1 text-[10px] normal-case font-normal opacity-60">
            (depends on {parentParameterName})
          </span>
        )}
      </Label>
      <div className="flex items-center gap-1">
        <Select
          value={value}
          onValueChange={onChange}
          disabled={isWaitingForParent}
          aria-labelledby={labelId}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder={resolvedPlaceholder} />
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

export { CascadingSelector };
