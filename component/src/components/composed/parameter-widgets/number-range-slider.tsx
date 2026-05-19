"use client";

import { useState } from "react";
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
  /** "integer" coerces inputs/typed values to whole numbers. Default: "integer". */
  numberType?: "integer" | "float";
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
  numberType = "integer",
  showInputs = true,
  className,
}: NumberRangeSliderProps) {
  const labelId = `param-numrange-label-${parameterName}`;
  const current: [number, number] = value ?? [min, max];
  const hasValue = value !== null;

  const coerce = (n: number) => (numberType === "integer" ? Math.round(n) : n);

  // Draft strings let the user type "-" or "" or partial numbers without the
  // input value snapping back. We resync from `current` whenever it changes
  // externally (e.g. slider drag, clear) using the React "adjust state in
  // render" pattern: https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [minDraft, setMinDraft] = useState<string>(String(current[0]));
  const [maxDraft, setMaxDraft] = useState<string>(String(current[1]));
  const [prevMin, setPrevMin] = useState(current[0]);
  const [prevMax, setPrevMax] = useState(current[1]);
  if (current[0] !== prevMin) {
    setPrevMin(current[0]);
    setMinDraft(String(current[0]));
  }
  if (current[1] !== prevMax) {
    setPrevMax(current[1]);
    setMaxDraft(String(current[1]));
  }

  const handleSliderChange = (vals: number[]) => {
    // Radix can emit a 1-element array when min===max; fall back to the
    // other handle so we always emit a [number, number] tuple.
    const next0 = vals[0] ?? current[0];
    const next1 = vals[1] ?? next0;
    onChange([coerce(next0), coerce(next1)]);
  };

  const commitMin = (raw: string) => {
    if (raw === "" || raw === "-") {
      setMinDraft(String(current[0]));
      return;
    }
    const num = Number(raw);
    if (isNaN(num)) {
      setMinDraft(String(current[0]));
      return;
    }
    const clamped = Math.min(Math.max(num, min), current[1]);
    onChange([coerce(clamped), current[1]]);
  };

  const commitMax = (raw: string) => {
    if (raw === "" || raw === "-") {
      setMaxDraft(String(current[1]));
      return;
    }
    const num = Number(raw);
    if (isNaN(num)) {
      setMaxDraft(String(current[1]));
      return;
    }
    const clamped = Math.max(Math.min(num, max), current[0]);
    onChange([current[0], coerce(clamped)]);
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <Label
          id={labelId}
          className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
        >
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
            type="text"
            inputMode="numeric"
            value={minDraft}
            onChange={(e) => setMinDraft(e.target.value)}
            onBlur={(e) => commitMin(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitMin(e.currentTarget.value);
            }}
            className="w-20 text-center text-sm h-7"
            aria-label={`${parameterName} minimum`}
          />
          <span className="text-xs text-muted-foreground flex-shrink-0">
            to
          </span>
          <Input
            type="text"
            inputMode="numeric"
            value={maxDraft}
            onChange={(e) => setMaxDraft(e.target.value)}
            onBlur={(e) => commitMax(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitMax(e.currentTarget.value);
            }}
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
