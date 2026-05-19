"use client";

import { NumberRangeSlider } from "@neoboard/components";
import type { ParamActions } from "./use-param-actions";

interface ParamNumberRangeProps {
  parameterName: string;
  actions: ParamActions;
  rangeMin: number;
  rangeMax: number;
  rangeStep: number;
  className?: string;
}

export function ParamNumberRange({
  parameterName,
  actions,
  rangeMin,
  rangeMax,
  rangeStep,
  className,
}: ParamNumberRangeProps) {
  const rawRange = actions.currentEntry?.value;
  let rangeValue: [number, number] | null = null;
  if (Array.isArray(rawRange) && rawRange.length >= 2) {
    const lo = Number(rawRange[0]);
    const hi = Number(rawRange[1]);
    if (Number.isFinite(lo) && Number.isFinite(hi)) rangeValue = [lo, hi];
  }

  const handleChange = (vals: [number, number]) => {
    actions.set(vals);
    // Companions are scalar numbers — typed as "text" so coerceValue
    // accepts them. "number-range" is reserved for the [min, max] tuple.
    actions.setCompanion("min", vals[0], "text");
    actions.setCompanion("max", vals[1], "text");
  };

  const handleClear = () => {
    actions.clear();
    actions.clearCompanion("min");
    actions.clearCompanion("max");
  };

  return (
    <NumberRangeSlider
      parameterName={parameterName}
      min={rangeMin}
      max={rangeMax}
      step={rangeStep}
      value={rangeValue}
      onChange={handleChange}
      onClear={handleClear}
      showInputs
      className={className}
    />
  );
}
