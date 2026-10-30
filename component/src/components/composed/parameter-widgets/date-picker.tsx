"use client";

import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { ParamLabel } from "./param-label";
import { humanizeParamName } from "@/lib/humanize-param-name";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { pickerTriggerClasses } from "@/components/ui/control-sizes";
import { cn } from "@/lib/utils";
import { qualifiedName, type ExternalLabelProps } from "./external-label";
import { parseIsoDate, formatIsoDate } from "../../../lib/date-utils";

export interface DatePickerParameterProps extends ExternalLabelProps {
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
  labelledBy,
  id,
  describedBy,
  invalid,
}: DatePickerParameterProps) {
  const [open, setOpen] = React.useState(false);
  const labelId = labelledBy ?? `param-date-label-${parameterName}`;
  const clearId = React.useId();

  const selected = parseIsoDate(value);

  const handleSelect = (date: Date | undefined) => {
    onChange(date ? formatIsoDate(date) : "");
    setOpen(false);
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      {!labelledBy && <ParamLabel parameterName={parameterName} id={labelId} />}
      <div className="relative flex items-center">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              id={id}
              variant="secondary"
              aria-labelledby={labelId}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              className={cn(
                pickerTriggerClasses,
                "justify-start text-left",
                value && "pr-9",
                !selected && "text-muted-foreground",
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
              autoFocus
            />
          </PopoverContent>
        </Popover>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => onChange("")}
            {...qualifiedName(
              labelledBy,
              clearId,
              `Clear ${humanizeParamName(parameterName)}`,
              true,
            )}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
        {labelledBy && (
          <span id={clearId} hidden>
            Clear
          </span>
        )}
      </div>
    </div>
  );
}

export { DatePickerParameter };
