"use client";

import { useEffect, useRef } from "react";
import { useParameterStore } from "@/stores/parameter-store";
import type { ParameterType } from "@/stores/parameter-store";

/**
 * Clears the child parameter when the parent value changes (cascading-select only).
 */
export function useCascadingClear(
  parameterName: string,
  parameterType: ParameterType,
  parentParameterName?: string,
  parentValue?: string,
) {
  const clearParameter = useParameterStore((s) => s.clearParameter);
  const prevParentValue = useRef(parentValue);

  useEffect(() => {
    if (
      parameterType === "cascading-select" &&
      parentParameterName &&
      prevParentValue.current !== parentValue
    ) {
      prevParentValue.current = parentValue;
      clearParameter(parameterName);
    }
  }, [
    parameterType,
    parentParameterName,
    parentValue,
    parameterName,
    clearParameter,
  ]);
}
