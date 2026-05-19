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
  let rangeValue: [number, number] | null = null;
  if (Array.isArray(rawRange) && rawRange.length >= 2) {
    const lo = Number(rawRange[0]);
    const hi = Number(rawRange[1]);
    // Drop tuples that don't parse to finite numbers — a corrupt restore would
    // otherwise leave the slider stuck at [NaN, NaN].
    if (Number.isFinite(lo) && Number.isFinite(hi)) {
      rangeValue = [lo, hi];
    }
  }

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
