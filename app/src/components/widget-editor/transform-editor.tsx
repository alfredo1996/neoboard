"use client";

import React from "react";
import { Plus, Trash2, GripVertical, Check } from "lucide-react";
import { Button, Input, Label, Badge } from "@neoboard/components";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@neoboard/components";
import * as SelectPrimitive from "@radix-ui/react-select";
import type { Transform } from "@/lib/query/data-transforms";
import { computeColumnsPerStep } from "@/lib/query/data-transforms";
import { ValueOrParamInput } from "./value-or-param-input";

export interface TransformEditorProps {
  transforms: Transform[];
  onChange: (transforms: Transform[]) => void;
  columns: string[];
  /** Available parameter names for $param_xxx references in filter values and expressions */
  parameterSuggestions?: string[];
  /** First row of query results, used to simulate pipeline column output */
  sampleRow?: Record<string, unknown>;
  /** Enable/disable the entire transform pipeline */
  enabled?: boolean;
  onEnabledChange?: (enabled: boolean) => void;
}

const TRANSFORM_TYPES = [
  {
    value: "filter",
    label: "Filter",
    description: "Remove rows matching a condition",
  },
  { value: "sort", label: "Sort", description: "Order rows by column values" },
  {
    value: "groupBy",
    label: "Group By",
    description: "Aggregate rows by column (sum, count, avg)",
  },
  {
    value: "calculatedColumn",
    label: "Calculated Column",
    description: "Add a computed column from existing data",
  },
  {
    value: "renameColumns",
    label: "Rename Columns",
    description: "Change column display names",
  },
  {
    value: "limit",
    label: "Limit",
    description: "Restrict the number of rows shown",
  },
] as const;

const FILTER_OPERATORS = [
  { value: ">", label: ">" },
  { value: ">=", label: ">=" },
  { value: "<", label: "<" },
  { value: "<=", label: "<=" },
  { value: "==", label: "==" },
  { value: "!=", label: "!=" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "not contains" },
];

const AGG_FUNCTIONS = [
  { value: "count", label: "Count" },
  { value: "sum", label: "Sum" },
  { value: "avg", label: "Average" },
  { value: "min", label: "Min" },
  { value: "max", label: "Max" },
];

function makeDefault(type: string, columns: string[]): Transform {
  const col = columns[0] ?? "";
  switch (type) {
    case "filter":
      return { type: "filter", column: col, operator: "==", value: "" };
    case "sort":
      return { type: "sort", column: col, direction: "asc" };
    case "groupBy":
      return {
        type: "groupBy",
        column: col,
        aggregations: [{ column: col, fn: "count" }],
      };
    case "calculatedColumn":
      return { type: "calculatedColumn", name: "new_column", expression: "" };
    case "renameColumns":
      return { type: "renameColumns", mapping: {} };
    case "limit":
      return { type: "limit", count: 100 };
    default:
      return { type: "limit", count: 100 };
  }
}

function TransformCard({
  transform,
  index,
  columns,
  parameterSuggestions,
  onChange,
  onRemove,
}: {
  transform: Transform;
  index: number;
  columns: string[];
  parameterSuggestions?: string[];
  onChange: (t: Transform) => void;
  onRemove: () => void;
}) {
  const typeLabel =
    TRANSFORM_TYPES.find((t) => t.value === transform.type)?.label ??
    transform.type;

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
          <Badge variant="outline" className="text-xs">
            {index + 1}. {typeLabel}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onRemove}
          aria-label="Remove transform"
        >
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {transform.type === "filter" && (
          <>
            <div className="space-y-1">
              <Label className="text-xs">Column</Label>
              <Select
                value={transform.column}
                onValueChange={(v) => onChange({ ...transform, column: v })}
              >
                <SelectTrigger className="w-[120px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {columns.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Operator</Label>
              <Select
                value={transform.operator}
                onValueChange={(v) =>
                  onChange({
                    ...transform,
                    operator: v as Transform & { type: "filter" } extends {
                      operator: infer O;
                    }
                      ? O
                      : never,
                  })
                }
              >
                <SelectTrigger className="w-[100px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FILTER_OPERATORS.map((op) => (
                    <SelectItem key={op.value} value={op.value}>
                      {op.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Value</Label>
              <ValueOrParamInput
                parameterRef={transform.paramRef}
                onParamRefChange={(ref) =>
                  onChange({ ...transform, paramRef: ref })
                }
                value={transform.value}
                onValueChange={(v) => onChange({ ...transform, value: v })}
                parameterSuggestions={parameterSuggestions ?? []}
                placeholder="value or param"
              />
            </div>
          </>
        )}

        {transform.type === "sort" && (
          <>
            <div className="space-y-1">
              <Label className="text-xs">Column</Label>
              <Select
                value={transform.column}
                onValueChange={(v) => onChange({ ...transform, column: v })}
              >
                <SelectTrigger className="w-[120px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {columns.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Direction</Label>
              <Select
                value={transform.direction}
                onValueChange={(v) =>
                  onChange({ ...transform, direction: v as "asc" | "desc" })
                }
              >
                <SelectTrigger className="w-[100px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">Ascending</SelectItem>
                  <SelectItem value="desc">Descending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        {transform.type === "groupBy" && (
          <>
            <div className="space-y-1">
              <Label className="text-xs">Group Column</Label>
              <Select
                value={transform.column}
                onValueChange={(v) => onChange({ ...transform, column: v })}
              >
                <SelectTrigger className="w-[120px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {columns.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 w-full">
              <Label className="text-xs">
                Aggregations → output: column_fn
              </Label>
              {transform.aggregations.map((agg, ai) => (
                <div key={ai} className="flex items-center gap-2">
                  <Select
                    value={agg.column}
                    onValueChange={(v) => {
                      const next = [...transform.aggregations];
                      next[ai] = { ...agg, column: v };
                      onChange({ ...transform, aggregations: next });
                    }}
                  >
                    <SelectTrigger className="w-[100px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {columns.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={agg.fn}
                    onValueChange={(v) => {
                      const next = [...transform.aggregations];
                      next[ai] = { ...agg, fn: v as typeof agg.fn };
                      onChange({ ...transform, aggregations: next });
                    }}
                  >
                    <SelectTrigger className="w-[90px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AGG_FUNCTIONS.map((f) => (
                        <SelectItem key={f.value} value={f.value}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-[10px] text-muted-foreground">
                    → {agg.column}_{agg.fn}
                  </span>
                  {transform.aggregations.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => {
                        const next = transform.aggregations.filter(
                          (_, j) => j !== ai,
                        );
                        onChange({ ...transform, aggregations: next });
                      }}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  const next = [
                    ...transform.aggregations,
                    { column: columns[0] ?? "", fn: "count" as const },
                  ];
                  onChange({ ...transform, aggregations: next });
                }}
              >
                <Plus className="h-3 w-3 mr-1" /> Add aggregation
              </Button>
            </div>
          </>
        )}

        {transform.type === "calculatedColumn" && (
          <>
            <div className="space-y-1">
              <Label className="text-xs">Column Name</Label>
              <Input
                className="w-[120px] h-8 text-xs"
                value={transform.name}
                onChange={(e) =>
                  onChange({ ...transform, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-1 flex-1">
              <Label className="text-xs">
                Expression (left-to-right, +&minus;*/)
              </Label>
              <Input
                className="h-8 text-xs"
                value={transform.expression}
                onChange={(e) =>
                  onChange({ ...transform, expression: e.target.value })
                }
                placeholder="e.g. salary * 0.1 or col + $param_rate"
              />
            </div>
          </>
        )}

        {transform.type === "renameColumns" && (
          <div className="space-y-1 flex-1">
            <Label className="text-xs">
              Mappings (old=new, comma-separated)
            </Label>
            <Input
              className="h-8 text-xs"
              value={Object.entries(transform.mapping)
                .map(([k, v]) => `${k}=${v}`)
                .join(", ")}
              onChange={(e) => {
                const mapping: Record<string, string> = {};
                for (const pair of e.target.value.split(",")) {
                  const [old, newName] = pair.split("=").map((s) => s.trim());
                  if (old && newName) mapping[old] = newName;
                }
                onChange({ ...transform, mapping });
              }}
              placeholder="e.g. name=Employee, salary=Pay"
            />
          </div>
        )}

        {transform.type === "limit" && (
          <div className="space-y-1">
            <Label className="text-xs">Max Rows</Label>
            <Input
              type="number"
              className="w-[100px] h-8 text-xs"
              value={transform.count}
              onChange={(e) =>
                onChange({
                  ...transform,
                  count: Math.max(1, Number(e.target.value) || 1),
                })
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function TransformEditor({
  transforms,
  onChange,
  columns,
  parameterSuggestions,
  sampleRow,
  enabled = true,
  onEnabledChange,
}: TransformEditorProps) {
  const [addType, setAddType] = React.useState<string>("filter");

  // Compute per-step columns: each transform sees output of all preceding steps
  const columnsPerStep = React.useMemo(
    () => computeColumnsPerStep(columns, transforms, sampleRow),
    [columns, transforms, sampleRow],
  );

  function addTransform() {
    onChange([...transforms, makeDefault(addType, columns)]);
  }

  function updateTransform(index: number, t: Transform) {
    const next = [...transforms];
    next[index] = t;
    onChange(next);
  }

  function removeTransform(index: number) {
    onChange(transforms.filter((_, i) => i !== index));
  }

  if (columns.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Run a query first to see available columns for transforms.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {onEnabledChange && (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="transforms-enabled"
            checked={enabled}
            onChange={(e) => onEnabledChange(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          <Label htmlFor="transforms-enabled" className="text-sm font-medium">
            Enable transforms
          </Label>
        </div>
      )}
      {!enabled && transforms.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Transforms are disabled. The chart shows raw query data.
        </p>
      )}
      {enabled && transforms.length === 0 && (
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>
            No transforms configured. Transforms modify query results
            client-side without changing the original query.
          </p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>
              <strong>Filter</strong> — remove rows matching a condition
            </li>
            <li>
              <strong>Sort</strong> — order rows by a column
            </li>
            <li>
              <strong>Group By</strong> — aggregate rows (sum, count, avg)
            </li>
            <li>
              <strong>Calculated Column</strong> — add a computed column
            </li>
            <li>
              <strong>Rename Columns</strong> — change column display names
            </li>
            <li>
              <strong>Limit</strong> — cap the number of rows shown
            </li>
          </ul>
        </div>
      )}
      {transforms.map((t, i) => (
        <TransformCard
          key={i}
          transform={t}
          index={i}
          columns={columnsPerStep[i] ?? columns}
          parameterSuggestions={parameterSuggestions}
          onChange={(updated) => updateTransform(i, updated)}
          onRemove={() => removeTransform(i)}
        />
      ))}
      <div className="flex items-center gap-2">
        <Select value={addType} onValueChange={setAddType}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TRANSFORM_TYPES.map((t) => (
              <SelectPrimitive.Item
                key={t.value}
                value={t.value}
                className="relative flex w-full cursor-default select-none flex-col rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
              >
                <span className="absolute right-2 top-2 flex h-3.5 w-3.5 items-center justify-center">
                  <SelectPrimitive.ItemIndicator>
                    <Check className="h-4 w-4" />
                  </SelectPrimitive.ItemIndicator>
                </span>
                <SelectPrimitive.ItemText>{t.label}</SelectPrimitive.ItemText>
                <span className="text-muted-foreground text-[11px] leading-tight">
                  {t.description}
                </span>
              </SelectPrimitive.Item>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          className="gap-1 h-8 text-xs"
          onClick={addTransform}
        >
          <Plus className="h-3 w-3" />
          Add
        </Button>
      </div>
    </div>
  );
}
