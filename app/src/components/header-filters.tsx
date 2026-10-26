"use client";

import { useMemo } from "react";
import { FiltersButton } from "@neoboard/components/kit";
import { useParameterStore } from "@/stores/parameter-store";
import {
  buildDashboardFilters,
  filterClearNames,
} from "@/lib/parameter/dashboard-filters";
import type { ParameterSourceMap } from "@/lib/parameter/collect-parameter-names";

interface HeaderFiltersProps {
  parameterSourceMap: ParameterSourceMap;
  /** Jumps to a filter's selector, switching page first when it sits on another. */
  onJump: (pageId: string | undefined, widgetId: string) => void;
}

/**
 * The header's Filters button (#2297). Subscribes to the parameter store
 * itself, so the workspace does not re-render on every parameter change.
 */
export function HeaderFilters({
  parameterSourceMap,
  onJump,
}: Readonly<HeaderFiltersProps>) {
  const parameters = useParameterStore((s) => s.parameters);
  const clearParameter = useParameterStore((s) => s.clearParameter);
  const clearAll = useParameterStore((s) => s.clearAll);
  const items = useMemo(
    () =>
      buildDashboardFilters(parameterSourceMap, parameters).map((f) => ({
        id: f.id,
        label: f.label,
        value: f.value,
        where: f.where,
        onSelect: f.sourceWidgetId
          ? () => onJump(f.pageId, f.sourceWidgetId!)
          : undefined,
      })),
    [parameterSourceMap, parameters, onJump],
  );
  return (
    <FiltersButton
      items={items}
      onClear={(id) => filterClearNames(id).forEach((n) => clearParameter(n))}
      onClearAll={clearAll}
    />
  );
}
