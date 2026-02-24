"use client";

import * as React from "react";
import { X } from "lucide-react";
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

export interface ParamSelectorOption {
  label: string;
  value: string;
}

export interface ParamSelectorProps {
  parameterName: string;
  options: ParamSelectorOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  loading?: boolean;
  className?: string;
}

/**
 * Single-select dropdown for a parameter widget seeded from a DB query.
 * Pure presentational — receives options as props, calls onChange.
 */
function ParamSelector({
  parameterName,
  options,
  value,
  onChange,
  placeholder = "Select a value…",
  loading = false,
  className,
}: ParamSelectorProps) {
  const labelId = `param-select-label-${parameterName}`;

  if (loading) {
    return (
      <div className={cn("space-y-1.5", className)}>
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

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
