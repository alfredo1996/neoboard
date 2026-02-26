"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface NumberRangeSliderProps {
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
}: NumberRangeSliderProps) {
  const labelId = `param-numrange-label-${parameterName}`;
  const current: [number, number] = value ?? [min, max];
  const hasValue = value !== null;

  const handleSliderChange = (vals: number[]) => {
    onChange([vals[0], vals[1]]);
  };

  const handleMinInput = (raw: string) => {
    const num = Number(raw);
    if (isNaN(num)) return;
    const clamped = Math.min(Math.max(num, min), current[1]);
    onChange([clamped, current[1]]);
  };

  const handleMaxInput = (raw: string) => {
    const num = Number(raw);
    if (isNaN(num)) return;
    const clamped = Math.max(Math.min(num, max), current[0]);
    onChange([current[0], clamped]);
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <Label id={labelId} className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {parameterName}
        </Label>
        {hasValue && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-5 px-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={onClear}
            aria-label={`Clear ${parameterName}`}
          >
            <X className="h-3 w-3 mr-0.5" />
            Reset
          </Button>
        )}
      </div>

      {showInputs && (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={current[0]}
            onChange={(e) => handleMinInput(e.target.value)}
            min={min}
            max={current[1]}
            step={step}
            className="w-20 text-center text-sm h-7"
            aria-label={`${parameterName} minimum`}
          />
          <span className="text-xs text-muted-foreground flex-shrink-0">to</span>
          <Input
            type="number"
            value={current[1]}
            onChange={(e) => handleMaxInput(e.target.value)}
            min={current[0]}
            max={max}
            step={step}
            className="w-20 text-center text-sm h-7"
            aria-label={`${parameterName} maximum`}
          />
        </div>
      )}

      <Slider
        min={min}
        max={max}
        step={step}
        value={current}
        onValueChange={handleSliderChange}
        aria-labelledby={labelId}
        className="w-full"
      />

      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

export { NumberRangeSlider };
