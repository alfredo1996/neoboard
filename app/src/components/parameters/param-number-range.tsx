"use client";

import { NumberRangeSlider } from "@neoboard/components";
import type { ParamActions } from "./use-param-actions";

interface ParamNumberRangeProps {
  parameterName: string;
  actions: ParamActions;
  rangeMin: number;
  rangeMax: number;
  rangeStep: number;
  /** "integer" snaps values to whole numbers, "float" allows decimals. Default: "integer". */
  rangeNumberType?: "integer" | "float";
  className?: string;
}

export function ParamNumberRange({
  parameterName,
  actions,
  rangeMin,
  rangeMax,
  rangeStep,
  rangeNumberType = "integer",
  className,
}: ParamNumberRangeProps) {
  const rawRange = actions.currentEntry?.value;
  const rangeValue: [number, number] | null = Array.isArray(rawRange)
    ? [Number(rawRange[0]), Number(rawRange[1])]
    : null;

  const handleChange = (vals: [number, number]) => {
    const coerced: [number, number] =
      rangeNumberType === "integer"
        ? [Math.round(vals[0]), Math.round(vals[1])]
        : vals;
    actions.set(coerced);
    actions.setCompanion("min", coerced[0], "number-range");
    actions.setCompanion("max", coerced[1], "number-range");
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
      numberType={rangeNumberType}
      value={rangeValue}
      onChange={handleChange}
      onClear={handleClear}
      showInputs
      className={className}
    />
  );
}
