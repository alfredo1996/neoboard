"use client";

import React, { useState, useEffect, useRef } from "react";
import { useWidgetEditorStore } from "@/stores/widget-editor-store";
import {
  Calendar,
  Type,
  ListFilter,
  SlidersHorizontal,
  GitBranch,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Button,
  Label,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Checkbox,
  Textarea,
} from "@neoboard/components";

// ── Parameter type mapping helpers ──────────────────────────────────
//
// `ParamUIType` is the editor's UX-facing taxonomy: each value corresponds
// to a top-level dropdown choice. It's intentionally narrower than the
// runtime `parameterType` (8 values) — `"date"` collapses 3 sub-modes
// into one selector + a sub-radio, and `"select"` collapses single vs
// multi via a checkbox. The remaining runtime types (`number-range`,
// `cascading-select`) get their own top-level entries.
export type ParamUIType =
  | "date"
  | "freetext"
  | "select"
  | "number-range"
  | "cascading";
export type DateSubType = "single" | "range" | "relative";

export function resolveInternalParamType(
  ui: ParamUIType,
  dateSub: DateSubType,
  multi: boolean,
): string {
  if (ui === "date") {
    return dateSub === "range"
      ? "date-range"
      : dateSub === "relative"
        ? "date-relative"
        : "date";
  }
  if (ui === "freetext") return "text";
  if (ui === "number-range") return "number-range";
  if (ui === "cascading") return "cascading-select";
  return multi ? "multi-select" : "select";
}

export function reverseParamTypeMapping(t: string): {
  uiType: ParamUIType;
  dateSub: DateSubType;
  multi: boolean;
} {
  switch (t) {
    case "date":
      return { uiType: "date", dateSub: "single", multi: false };
    case "date-range":
      return { uiType: "date", dateSub: "range", multi: false };
    case "date-relative":
      return { uiType: "date", dateSub: "relative", multi: false };
    case "text":
      return { uiType: "freetext", dateSub: "single", multi: false };
    case "multi-select":
      return { uiType: "select", dateSub: "single", multi: true };
    case "number-range":
      return { uiType: "number-range", dateSub: "single", multi: false };
    case "cascading-select":
      return { uiType: "cascading", dateSub: "single", multi: false };
    default:
      return { uiType: "select", dateSub: "single", multi: false };
  }
}

const paramTypeMeta: Record<ParamUIType, { label: string; Icon: LucideIcon }> =
  {
    date: { label: "Date Picker", Icon: Calendar },
    freetext: { label: "Freetext", Icon: Type },
    select: { label: "Select", Icon: ListFilter },
    "number-range": { label: "Number Range", Icon: SlidersHorizontal },
    cascading: { label: "Cascading Select", Icon: GitBranch },
  };

const paramTypes = Object.keys(paramTypeMeta) as ParamUIType[];

/**
 * Debounced seed query input — local draft state + 300ms debounce before
 * syncing to chartOptions to prevent excessive re-renders on every keystroke.
 */
function SeedQueryInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState(value);
  // Track the prop value so we can detect external updates (e.g. a parent
  // resetting it) and resync the draft *during render*, per
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setDraft(value);
  }
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(() => {
      onChangeRef.current(draft);
    }, 300);
    return () => clearTimeout(timer);
  }, [draft, value]);

  return (
    <Textarea
      id="seed-query"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      placeholder={placeholder}
      className="font-mono min-h-[80px]"
      rows={3}
    />
  );
}

export interface SeedQueryExecutionState {
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  mutate: (args: { connectionId: string; query: string }) => void;
}

export interface ParameterConfigSectionProps {
  seedQueryExecution: SeedQueryExecutionState;
  seedPreviewOptions: { value: string; label: string }[] | null;
}

export function ParameterConfigSection({
  seedQueryExecution,
  seedPreviewOptions,
}: ParameterConfigSectionProps) {
  const paramUIType = useWidgetEditorStore((s) => s.paramUIType);
  const onParamUITypeChange = useWidgetEditorStore((s) => s.setParamUIType);
  const dateSub = useWidgetEditorStore((s) => s.dateSub);
  const onDateSubChange = useWidgetEditorStore((s) => s.setDateSub);
  const multiSelect = useWidgetEditorStore((s) => s.multiSelect);
  const onMultiSelectChange = useWidgetEditorStore((s) => s.setMultiSelect);
  const paramWidgetName = useWidgetEditorStore((s) => s.paramWidgetName);
  const onParamWidgetNameChange = useWidgetEditorStore(
    (s) => s.setParamWidgetName,
  );
  const chartOptions = useWidgetEditorStore((s) => s.chartOptions);
  const onChartOptionsChange = useWidgetEditorStore((s) => s.setChartOptions);
  const connectionId = useWidgetEditorStore((s) => s.connectionId);
  return (
    <div className="space-y-4" data-testid="param-config-section">
      {/* Parameter Type dropdown */}
      <div className="space-y-1.5">
        <Label>Parameter Type</Label>
        <Select
          value={paramUIType}
          onValueChange={(v) => onParamUITypeChange(v as ParamUIType)}
        >
          <SelectTrigger data-testid="param-type-select">
            <SelectValue placeholder="Select parameter type..." />
          </SelectTrigger>
          <SelectContent>
            {paramTypes.map((type) => {
              const m = paramTypeMeta[type];
              const Icon = m.Icon;
              return (
                <SelectItem key={type} value={type}>
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {m.label}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {/* Date mode (only for date) */}
      {paramUIType === "date" && (
        <div className="space-y-1.5">
          <Label>Date Mode</Label>
          <Select
            value={dateSub}
            onValueChange={(v) => onDateSubChange(v as DateSubType)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="single">Single Date</SelectItem>
              <SelectItem value="range">Date Range</SelectItem>
              <SelectItem value="relative">Relative Date</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Multi-select toggle (only for select) */}
      {paramUIType === "select" && (
        <div className="flex items-center gap-2">
          <Checkbox
            id="multi-select-toggle"
            checked={multiSelect}
            onCheckedChange={(checked) => onMultiSelectChange(!!checked)}
          />
          <Label htmlFor="multi-select-toggle" className="text-sm">
            Allow multiple selections
          </Label>
        </div>
      )}

      {/* Number-range bounds (only for number-range) */}
      {paramUIType === "number-range" && (
        <div className="space-y-1.5" data-testid="param-number-range-config">
          <Label>Range Bounds</Label>
          <div className="flex items-center gap-2">
            <Input
              id="range-min"
              type="number"
              aria-label="Range minimum"
              value={(chartOptions.rangeMin as number | undefined) ?? 0}
              onChange={(e) =>
                onChartOptionsChange((prev) => ({
                  ...prev,
                  rangeMin: Number(e.target.value),
                }))
              }
              className="w-24"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              id="range-max"
              type="number"
              aria-label="Range maximum"
              value={(chartOptions.rangeMax as number | undefined) ?? 100}
              onChange={(e) =>
                onChartOptionsChange((prev) => ({
                  ...prev,
                  rangeMax: Number(e.target.value),
                }))
              }
              className="w-24"
            />
            <span className="text-xs text-muted-foreground">step</span>
            <Input
              id="range-step"
              type="number"
              aria-label="Range step"
              min={0}
              value={(chartOptions.rangeStep as number | undefined) ?? 1}
              onChange={(e) =>
                onChartOptionsChange((prev) => ({
                  ...prev,
                  rangeStep: Number(e.target.value),
                }))
              }
              className="w-20"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Use <code className="bg-muted px-1 rounded">step</code> ≥ 1 for
            integers, or a fractional value (e.g. 0.1) for floats.
          </p>
        </div>
      )}

      {/* Cascading parent (only for cascading) */}
      {paramUIType === "cascading" && (
        <div className="space-y-1.5" data-testid="param-cascading-config">
          <Label htmlFor="parent-param-name">Parent Parameter Name</Label>
          <Input
            id="parent-param-name"
            value={(chartOptions.parentParameterName as string) ?? ""}
            onChange={(e) =>
              onChartOptionsChange((prev) => ({
                ...prev,
                parentParameterName: e.target.value,
              }))
            }
            placeholder="e.g. country"
          />
          <p className="text-xs text-muted-foreground">
            The seed query below can reference the parent via{" "}
            <code className="bg-muted px-1 rounded">
              $param_
              {(chartOptions.parentParameterName as string) || "parent"}
            </code>
            . The cascade re-runs whenever the parent value changes.
          </p>
        </div>
      )}

      {/* Seed Query (for select and cascading) */}
      {(paramUIType === "select" || paramUIType === "cascading") && (
        <div className="space-y-1.5">
          <Label htmlFor="seed-query">
            Seed Query <span className="text-destructive">*</span>
          </Label>
          <p className="text-xs text-muted-foreground">
            Use columns named{" "}
            <code className="bg-muted px-1 rounded">value</code> and{" "}
            <code className="bg-muted px-1 rounded">label</code> (recommended),
            or first column = value, second = label
          </p>
          <SeedQueryInput
            value={(chartOptions.seedQuery as string) ?? ""}
            onChange={(v) =>
              onChartOptionsChange((prev) => ({ ...prev, seedQuery: v }))
            }
            placeholder="SELECT DISTINCT value FROM table ORDER BY value"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            disabled={
              !connectionId || !String(chartOptions.seedQuery ?? "").trim()
            }
            onClick={() => {
              const sq = (chartOptions.seedQuery as string) ?? "";
              if (connectionId && sq.trim()) {
                seedQueryExecution.mutate({ connectionId, query: sq });
              }
            }}
          >
            {seedQueryExecution.isPending ? "Running..." : "Test Seed Query"}
          </Button>
          {seedQueryExecution.isError && (
            <p className="text-xs text-destructive mt-1">
              {seedQueryExecution.error?.message}
            </p>
          )}
          {seedPreviewOptions && seedPreviewOptions.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              {seedPreviewOptions.length} option
              {seedPreviewOptions.length !== 1 ? "s" : ""} loaded — see preview
            </p>
          )}
        </div>
      )}

      {/* Parameter Name */}
      <div className="space-y-1.5">
        <Label htmlFor="param-widget-name">
          Parameter Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="param-widget-name"
          value={paramWidgetName}
          onChange={(e) => onParamWidgetNameChange(e.target.value)}
          placeholder="e.g. country"
        />
        <p className="text-xs text-muted-foreground">
          Used to reference this parameter in widget queries
        </p>
      </div>

      {/* Reference hint */}
      {paramWidgetName && (
        <div className="border-t pt-4" data-testid="param-reference-hint">
          <h4 className="text-sm font-medium mb-2">Reference in queries</h4>
          <div className="space-y-1.5 text-xs text-muted-foreground">
            <p>
              Other widgets can use this parameter as:{" "}
              <code className="bg-muted px-1 py-0.5 rounded text-foreground">
                $param_{paramWidgetName}
              </code>
            </p>
            {paramUIType === "date" &&
              (dateSub === "range" || dateSub === "relative") && (
                <p>
                  Date range sub-parameters:{" "}
                  <code className="bg-muted px-1 py-0.5 rounded text-foreground">
                    $param_{paramWidgetName}_from
                  </code>
                  ,{" "}
                  <code className="bg-muted px-1 py-0.5 rounded text-foreground">
                    $param_{paramWidgetName}_to
                  </code>
                </p>
              )}
            {paramUIType === "number-range" && (
              <p>
                Number range sub-parameters:{" "}
                <code className="bg-muted px-1 py-0.5 rounded text-foreground">
                  $param_{paramWidgetName}_min
                </code>
                ,{" "}
                <code className="bg-muted px-1 py-0.5 rounded text-foreground">
                  $param_{paramWidgetName}_max
                </code>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
