"use client";

import { useEffect, useRef } from "react";
import { useParameterStore } from "@/stores/parameter-store";

/**
 * Clears the child parameter when its parent's value changes.
 *
 * A parameter is cascading exactly when it names a parent — there is no
 * separate widget type to check (#1360).
 */
export function useCascadingClear(
  parameterName: string,
  parentParameterName?: string,
  parentValue?: string,
) {
  const clearParameter = useParameterStore((s) => s.clearParameter);
  const prevParentValue = useRef(parentValue);

  useEffect(() => {
    if (parentParameterName && prevParentValue.current !== parentValue) {
      prevParentValue.current = parentValue;
      // Both still on their defaults: the parent only moved because a reset
      // wrote them together, and the child's default is the right pair (#1851).
      const { parameters } = useParameterStore.getState();
      if (
        parameters[parameterName]?.sourceType === "default" &&
        parameters[parentParameterName]?.sourceType === "default"
      )
        return;
      clearParameter(parameterName);
    }
  }, [parentParameterName, parentValue, parameterName, clearParameter]);
}
