"use client";

import { useId } from "react";
import { X } from "lucide-react";
import { ParamLabel } from "./param-label";
import { humanizeParamName } from "@/lib/humanize-param-name";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  labelIdOf,
  qualifiedName,
  type ExternalLabelProps,
} from "./external-label";

export interface NumberRangeSliderProps extends ExternalLabelProps {
  parameterName: string;
  min: number;
  max: number;
  /** Current [min, max] selection. Defaults to [min, max] when null. */
  value: [number, number] | null;
  onChange: (value: [number, number]) => void;
  onClear: () => void;
  step?: number;
  showInputs?: boolean;
  className?: string;
}

/**
 * Dual-handle range slider parameter widget.
 * Sets two parameters: {parameterName}_min and {parameterName}_max.
 * Pure presentational — calls onChange with a [min, max] tuple.
 */
function NumberRangeSlider({
  parameterName,
  min,
  max,
  value,
  onChange,
  onClear,
  step = 1,
  showInputs = true,
  className,
  labelledBy,
  id,
  describedBy,
  invalid,
}: NumberRangeSliderProps) {
  const labelId = labelledBy ?? `param-numrange-label-${parameterName}`;
  const current: [number, number] = value ?? [min, max];
  const hasValue = value !== null;
  const qualifierId = useId();

  const handleSliderChange = (vals: number[]) => {
    onChange([vals[0], vals[1]]);
  };

  const handleMinInput = (raw: string) => {
    // Guard the RAW string: Number("") is 0, not NaN, so an isNaN check on the
    // coerced value never fires for the one input that reaches it — the empty
    // string a user produces by clearing the field to retype it (#1292).
    if (raw.trim() === "") return;
    const num = Number(raw);
    if (isNaN(num)) return;
    const clamped = Math.min(Math.max(num, min), current[1]);
    onChange([clamped, current[1]]);
  };

  const handleMaxInput = (raw: string) => {
    // Guard the RAW string: Number("") is 0, not NaN, so an isNaN check on the
    // coerced value never fires for the one input that reaches it — the empty
    // string a user produces by clearing the field to retype it (#1292).
    if (raw.trim() === "") return;
    const num = Number(raw);
    if (isNaN(num)) return;
    const clamped = Math.max(Math.min(num, max), current[0]);
    onChange([current[0], clamped]);
  };

  const resetButton = hasValue && (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-5 px-1 text-xs text-muted-foreground hover:text-foreground"
      onClick={onClear}
      {...qualifiedName(
        labelledBy,
        `${qualifierId}-clear`,
        `Clear ${humanizeParamName(parameterName)}`,
        true,
      )}
    >
      <X className="h-3 w-3 mr-0.5" />
      Reset
    </Button>
  );

  const slider = (cls: string) => (
    <Slider
      min={min}
      max={max}
      step={step}
      value={current}
      onValueChange={handleSliderChange}
      aria-labelledby={labelIdOf(labelId)}
      className={cls}
    />
  );

  return (
    <div className={cn("space-y-2", className)}>
      {(!labelledBy || !showInputs) && (
        <div className="flex items-center justify-between">
          {!labelledBy && (
            <ParamLabel parameterName={parameterName} id={labelId} />
          )}
          {!showInputs && resetButton}
        </div>
      )}
      {labelledBy && (
        <>
          <span id={`${qualifierId}-clear`} hidden>
            Clear
          </span>
          <span id={`${qualifierId}-min`} hidden>
            minimum
          </span>
          <span id={`${qualifierId}-max`} hidden>
            maximum
          </span>
        </>
      )}

      {showInputs && (
        <div className="flex items-center gap-2">
          <Input
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            type="number"
            value={current[0]}
            onChange={(e) => handleMinInput(e.target.value)}
            min={min}
            max={current[1]}
            step={step}
            className="w-14 shrink-0 text-center px-1"
            {...qualifiedName(
              labelledBy,
              `${qualifierId}-min`,
              `${humanizeParamName(parameterName)} minimum`,
            )}
          />
          <span className="text-xs text-muted-foreground flex-shrink-0">
            to
          </span>
          <Input
            // Explicit, or a surrounding <Field> hands it the min input's id.
            id={`${qualifierId}-max-input`}
            type="number"
            value={current[1]}
            onChange={(e) => handleMaxInput(e.target.value)}
            min={current[0]}
            max={max}
            step={step}
            className="w-14 shrink-0 text-center px-1"
            {...qualifiedName(
              labelledBy,
              `${qualifierId}-max`,
              `${humanizeParamName(parameterName)} maximum`,
            )}
          />
          {slider("min-w-16 flex-1")}
          {resetButton}
        </div>
      )}
      {!showInputs && slider("w-full")}

      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

export { NumberRangeSlider };
