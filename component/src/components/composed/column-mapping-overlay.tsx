import { useId } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface ColumnMapping {
  /** Bar: label column. Line: x column. Pie: name column. */
  xAxis?: string;
  /** Bar/line: value column(s). Pie: value column (first element). */
  yAxis?: string[];
  /** Optional grouping/series column. */
  groupBy?: string;
}

export interface ColumnMappingOverlayProps {
  chartType: "bar" | "line" | "pie";
  availableColumns: string[];
  mapping: ColumnMapping;
  onMappingChange: (mapping: ColumnMapping) => void;
  className?: string;
}

/** Sentinel value used in Select to represent "no selection / auto". */
const NONE_VALUE = "__none__";

function toSelectValue(v: string | undefined): string {
  return v ?? NONE_VALUE;
}

function fromSelectValue(v: string): string | undefined {
  return v === NONE_VALUE ? undefined : v;
}

/**
 * ColumnMappingOverlay — lightweight toolbar shown in edit mode that lets
 * users reassign which result columns map to chart axes without re-running
 * the query.
 *
 * This component is pure UI: it emits `onMappingChange` with the new mapping
 * and performs no data fetching or store access.
 */
function ColumnMappingOverlay({
  chartType,
  availableColumns,
  mapping,
  onMappingChange,
  className,
}: ColumnMappingOverlayProps) {
  // Stable base for label/trigger ids so each Select is programmatically
  // labeled by its visible field name (assistive tech otherwise hears only
  // the current value, e.g. "auto", with no idea which axis it controls).
  const uid = useId();
  if (availableColumns.length === 0) return null;

  const isPie = chartType === "pie";

  /** Label for the first axis field. */
  const xLabel = isPie ? "Name" : "X Axis";
  /** Label for the second axis field. */
  const yLabel = isPie ? "Value" : "Y Axis";

  function handleXChange(val: string) {
    onMappingChange({ ...mapping, xAxis: fromSelectValue(val) });
  }

  function handleYChange(val: string) {
    const resolved = fromSelectValue(val);
    onMappingChange({
      ...mapping,
      yAxis: resolved !== undefined ? [resolved] : [],
    });
  }

  function handleGroupByChange(val: string) {
    onMappingChange({ ...mapping, groupBy: fromSelectValue(val) });
  }

  // Current single Y value for the select (take first element of the array).
  const currentY = mapping.yAxis?.[0];

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 px-3 py-1.5 border-t bg-muted/40 text-xs",
        className,
      )}
      data-testid="column-mapping-overlay"
    >
      {/* X / Name */}
      <div className="flex items-center gap-1.5">
        <span
          id={`${uid}-x`}
          className="font-medium text-muted-foreground whitespace-nowrap"
        >
          {xLabel}
        </span>
        <Select
          value={toSelectValue(mapping.xAxis)}
          onValueChange={handleXChange}
        >
          <SelectTrigger
            id={`${uid}-xt`}
            aria-labelledby={`${uid}-x ${uid}-xt`}
            className="h-6 text-xs w-28 min-w-[7rem]"
            data-testid="column-mapping-x-trigger"
          >
            <SelectValue placeholder="auto" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE}>auto</SelectItem>
            {availableColumns.map((col) => (
              <SelectItem key={col} value={col}>
                {col}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Y / Value */}
      <div className="flex items-center gap-1.5">
        <span
          id={`${uid}-y`}
          className="font-medium text-muted-foreground whitespace-nowrap"
        >
          {yLabel}
        </span>
        <Select value={toSelectValue(currentY)} onValueChange={handleYChange}>
          <SelectTrigger
            id={`${uid}-yt`}
            aria-labelledby={`${uid}-y ${uid}-yt`}
            className="h-6 text-xs w-28 min-w-[7rem]"
            data-testid="column-mapping-y-trigger"
          >
            <SelectValue placeholder="auto" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE}>auto</SelectItem>
            {availableColumns.map((col) => (
              <SelectItem key={col} value={col}>
                {col}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Group By — not shown for pie charts */}
      {!isPie && (
        <div className="flex items-center gap-1.5">
          <span
            id={`${uid}-g`}
            className="font-medium text-muted-foreground whitespace-nowrap"
          >
            Group By
          </span>
          <Select
            value={toSelectValue(mapping.groupBy)}
            onValueChange={handleGroupByChange}
          >
            <SelectTrigger
              id={`${uid}-gt`}
              aria-labelledby={`${uid}-g ${uid}-gt`}
              className="h-6 text-xs w-28 min-w-[7rem]"
              data-testid="column-mapping-groupby-trigger"
            >
              <SelectValue placeholder="none" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>none</SelectItem>
              {availableColumns.map((col) => (
                <SelectItem key={col} value={col}>
                  {col}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

export { ColumnMappingOverlay };
