"use client";

import React, { useState, useEffect, useRef } from "react";
import { Calendar, Type, ListFilter } from "lucide-react";
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
export type ParamUIType = "date" | "freetext" | "select";
export type DateSubType = "single" | "range" | "relative";

export function resolveInternalParamType(
  ui: ParamUIType,
  dateSub: DateSubType,
  multi: boolean
): string {
  if (ui === "date") {
    return dateSub === "range"
      ? "date-range"
      : dateSub === "relative"
        ? "date-relative"
        : "date";
  }
  if (ui === "freetext") return "text";
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
    default:
      return { uiType: "select", dateSub: "single", multi: false };
  }
}

const paramTypeMeta: Record<ParamUIType, { label: string; Icon: LucideIcon }> = {
  date: { label: "Date Picker", Icon: Calendar },
  freetext: { label: "Freetext", Icon: Type },
  select: { label: "Select", Icon: ListFilter },
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
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    const timer = setTimeout(() => {
      onChangeRef.current(draft);
    }, 300);
    return () => clearTimeout(timer);
  }, [draft]);

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
  paramUIType: ParamUIType;
  onParamUITypeChange: (v: ParamUIType) => void;
  dateSub: DateSubType;
  onDateSubChange: (v: DateSubType) => void;
  multiSelect: boolean;
  onMultiSelectChange: (v: boolean) => void;
  paramWidgetName: string;
  onParamWidgetNameChange: (v: string) => void;
  chartOptions: Record<string, unknown>;
  onChartOptionsChange: (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => void;
  connectionId: string;
  seedQueryExecution: SeedQueryExecutionState;
  seedPreviewOptions: { value: string; label: string }[] | null;
}

export function ParameterConfigSection({
  paramUIType,
  onParamUITypeChange,
  dateSub,
  onDateSubChange,
  multiSelect,
  onMultiSelectChange,
  paramWidgetName,
  onParamWidgetNameChange,
  chartOptions,
  onChartOptionsChange,
  connectionId,
  seedQueryExecution,
  seedPreviewOptions,
}: ParameterConfigSectionProps) {
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
          <Select value={dateSub} onValueChange={(v) => onDateSubChange(v as DateSubType)}>
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

      {/* Seed Query (only for select type) */}
      {paramUIType === "select" && (
        <div className="space-y-1.5">
          <Label htmlFor="seed-query">Seed Query <span className="text-destructive">*</span></Label>
          <p className="text-xs text-muted-foreground">
            Use columns named <code className="bg-muted px-1 rounded">value</code> and <code className="bg-muted px-1 rounded">label</code> (recommended), or first column = value, second = label
          </p>
          <SeedQueryInput
            value={(chartOptions.seedQuery as string) ?? ""}
            onChange={(v) => onChartOptionsChange((prev) => ({ ...prev, seedQuery: v }))}
            placeholder="SELECT DISTINCT value FROM table ORDER BY value"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            disabled={!connectionId || !(chartOptions.seedQuery as string)?.trim()}
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
              {seedPreviewOptions.length} option{seedPreviewOptions.length !== 1 ? "s" : ""} loaded — see preview
            </p>
          )}
        </div>
      )}

      {/* Parameter Name */}
      <div className="space-y-1.5">
        <Label htmlFor="param-widget-name">Parameter Name <span className="text-destructive">*</span></Label>
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
            {paramUIType === "date" && (dateSub === "range" || dateSub === "relative") && (
              <p>
                Date range sub-parameters:{" "}
                <code className="bg-muted px-1 py-0.5 rounded text-foreground">$param_{paramWidgetName}_from</code>,{" "}
                <code className="bg-muted px-1 py-0.5 rounded text-foreground">$param_{paramWidgetName}_to</code>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
