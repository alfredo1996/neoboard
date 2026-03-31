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
  const rangeValue: [number, number] | null = Array.isArray(rawRange)
    ? [Number(rawRange[0]), Number(rawRange[1])]
    : null;

  const handleChange = (vals: [number, number]) => {
    actions.set(vals);
    actions.setCompanion("min", vals[0], "number-range");
    actions.setCompanion("max", vals[1], "number-range");
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
