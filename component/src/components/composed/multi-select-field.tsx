"use client";

import * as React from "react";
import { ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Tag } from "@/components/ui/tag";
import { PopoverTrigger } from "@/components/ui/popover";

export interface MultiSelectFieldProps extends Omit<
  React.ComponentProps<"button">,
  "children" | "className"
> {
  /** Whether the list is open. */
  readonly "aria-expanded": boolean;
  /** The id of the PopoverContent this trigger opens. */
  readonly "aria-controls": string;
  readonly selected: readonly { value: string; label: string }[];
  readonly maxDisplay: number;
  readonly placeholder: string;
  readonly onRemove: (value: string) => void;
  /** Horizontal padding of the field, shared by the shell and the trigger. */
  readonly padX: string;
  /** Border, width, hover and ring classes of the field. */
  readonly className?: string;
}

/**
 * The field both multi-selects share (#2275). The chips and the trigger are
 * siblings inside a field-styled shell: a remove button inside the trigger
 * <button> is presentational to assistive tech and cannot be reached by name.
 * The trigger is laid under the chips to cover the whole field; chips let
 * clicks through except on their remove buttons. Render inside a <Popover>.
 */
function MultiSelectField({
  "aria-expanded": expanded,
  "aria-controls": controls,
  selected,
  maxDisplay,
  placeholder,
  onRemove,
  padX,
  className,
  disabled,
  ...triggerProps
}: MultiSelectFieldProps) {
  const describedId = React.useId();
  const summary =
    selected.length > 0
      ? `${selected.length} selected: ${selected.map((o) => o.label).join(", ")}`
      : undefined;
  const describedBy =
    [triggerProps["aria-describedby"], summary && describedId]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div
      className={cn(
        "relative flex min-h-9 items-center rounded-sm border bg-field text-sm [@media(pointer:coarse)]:text-base text-foreground transition-[color,background-color,border-color] [transition-duration:var(--duration-fast)]",
        "has-[[role=combobox]:focus-visible]:outline-none has-[[role=combobox]:focus-visible]:ring-2 has-[[role=combobox]:focus-visible]:ring-ring has-[[role=combobox]:focus-visible]:ring-offset-background",
        "has-[[role=combobox]:disabled]:cursor-not-allowed has-[[role=combobox]:disabled]:bg-active has-[[role=combobox]:disabled]:opacity-50",
        "has-[[aria-invalid=true]]:border-destructive has-[[aria-invalid=true]]:hover:border-destructive has-[[aria-invalid=true]]:has-[[role=combobox]:focus-visible]:border-destructive has-[[aria-invalid=true]]:has-[[role=combobox]:focus-visible]:ring-destructive",
        padX,
        className,
      )}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          // NOSONAR: S6819 prefers <select multiple>, which cannot hold chips
          // with their own remove buttons; a combobox button is the pattern.
          role="combobox" // NOSONAR
          aria-expanded={expanded}
          aria-controls={controls}
          disabled={disabled}
          className={cn(
            "absolute inset-0 flex items-center justify-between rounded-[inherit] font-normal focus-visible:outline-none disabled:pointer-events-none",
            padX,
          )}
          {...triggerProps}
          aria-describedby={describedBy}
        >
          {selected.length === 0 && (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown
            aria-hidden="true"
            className="ml-auto h-4 w-4 shrink-0 opacity-50"
          />
        </button>
      </PopoverTrigger>
      {summary && (
        <span id={describedId} className="sr-only">
          {summary}
        </span>
      )}
      <div
        inert={disabled || undefined}
        className="pointer-events-none relative mr-6 flex min-w-0 flex-1 flex-wrap gap-1 [&_button]:pointer-events-auto"
      >
        {selected.slice(0, maxDisplay).map((option) => (
          <Tag key={option.value} onRemove={() => onRemove(option.value)}>
            {option.label}
          </Tag>
        ))}
        {selected.length > maxDisplay && (
          <span className="text-xs text-foreground-2">
            +{selected.length - maxDisplay} more
          </span>
        )}
      </div>
    </div>
  );
}

export { MultiSelectField };
