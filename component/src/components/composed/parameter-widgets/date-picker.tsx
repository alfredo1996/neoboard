"use client";

import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface DatePickerParameterProps {
  parameterName: string;
  /** ISO date string (YYYY-MM-DD) or empty string for no selection */
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/**
 * Single-date picker for a parameter widget.
 * The value is an ISO date string (YYYY-MM-DD).
 * Pure presentational — calls onChange with the new ISO string.
 */
function DatePickerParameter({
  parameterName,
  value,
  onChange,
  className,
}: DatePickerParameterProps) {
  const [open, setOpen] = React.useState(false);
  const labelId = `param-date-label-${parameterName}`;

  const selected = value ? new Date(value) : undefined;

  const handleSelect = (date: Date | undefined) => {
    if (date) {
      // Format as YYYY-MM-DD using local time to avoid UTC midnight shift
      const iso = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
      ].join("-");
      onChange(iso);
    } else {
      onChange("");
    }
    setOpen(false);
  };

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
              aria-labelledby={labelId}
              className={cn(
                "flex-1 justify-start text-left font-normal",
                !selected && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
              {selected ? format(selected, "MMM d, yyyy") : "Pick a date…"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selected}
              onSelect={handleSelect}
              initialFocus
            />
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

export { DatePickerParameter };
