"use client";

import type { ParameterType } from "@/stores/parameter-store";
import {
  useParamActions,
  useSeedQueryOptions,
  useCascadingClear,
  ParamText,
  ParamSelect,
  ParamMultiSelect,
  ParamDate,
  ParamDateRange,
  ParamDateRelative,
  ParamNumberRange,
} from "./parameters";

// ─── Widget config ───────────────────────────────────────────────────────────

export interface ParameterWidgetConfig {
  /** The parameter name (without $param_ prefix) */
  parameterName: string;
  /** Which of the 8 selector types to render */
  parameterType: ParameterType;
  /** DB connection for seed queries (select, multi-select) */
  connectionId?: string;
  /** SQL/Cypher query that returns label+value rows for select types */
  seedQuery?: string;
  /**
   * Parent parameter whose value seeds this query. Setting it makes a
   * select cascading — there is no separate cascading widget type (#1360).
   */
  parentParameterName?: string;
  /** For number-range: the lower bound of the slider */
  rangeMin?: number;
  /** For number-range: the upper bound of the slider */
  rangeMax?: number;
  /** For number-range: the step increment */
  rangeStep?: number;
  placeholder?: string;
  /** Enable search-as-you-type on select/multi-select (re-queries with $param_search) */
  searchable?: boolean;
  className?: string;
  /** The widget ID that owns this renderer — propagated to sourceWidgetId on setParameter. */
  widgetId?: string;
}

// ─── Main renderer (thin dispatcher) ─────────────────────────────────────────

/**
 * ParameterWidgetRenderer — app-layer orchestrator.
 *
 * Hooks handle store interactions, seed queries, and cascading logic.
 * Per-type components in ./parameters/ handle the rendering.
 */
export function ParameterWidgetRenderer({
  parameterName,
  parameterType,
  connectionId,
  seedQuery,
  parentParameterName,
  rangeMin = 0,
  rangeMax = 100,
  rangeStep = 1,
  placeholder,
  searchable = true,
  className,
  widgetId,
}: ParameterWidgetConfig) {
  const actions = useParamActions(parameterName, parameterType, widgetId);
  const seed = useSeedQueryOptions(
    parameterType,
    connectionId,
    seedQuery,
    parentParameterName,
    searchable,
  );
  useCascadingClear(parameterName, parentParameterName, seed.parentValue);

  switch (parameterType) {
    case "text":
      return (
        <ParamText
          parameterName={parameterName}
          actions={actions}
          placeholder={placeholder}
          className={className}
        />
      );
    case "select":
      return (
        <ParamSelect
          parameterName={parameterName}
          actions={actions}
          seed={seed}
          searchable={searchable}
          parentParameterName={parentParameterName}
          placeholder={placeholder}
          className={className}
        />
      );
    case "multi-select":
      return (
        <ParamMultiSelect
          parameterName={parameterName}
          actions={actions}
          seed={seed}
          searchable={searchable}
          parentParameterName={parentParameterName}
          placeholder={placeholder}
          className={className}
        />
      );
    case "date":
      return (
        <ParamDate
          parameterName={parameterName}
          actions={actions}
          className={className}
        />
      );
    case "date-range":
      return (
        <ParamDateRange
          parameterName={parameterName}
          actions={actions}
          className={className}
        />
      );
    case "date-relative":
      return (
        <ParamDateRelative
          parameterName={parameterName}
          actions={actions}
          className={className}
        />
      );
    case "number-range":
      return (
        <ParamNumberRange
          parameterName={parameterName}
          actions={actions}
          rangeMin={rangeMin}
          rangeMax={rangeMax}
          rangeStep={rangeStep}
          className={className}
        />
      );
    default:
      // The retired `cascading-select` no longer passes the plugin's
      // settings schema, so it never reaches here — it surfaces as the
      // "No parameter name" empty state instead (#1360).
      return null;
  }
}
