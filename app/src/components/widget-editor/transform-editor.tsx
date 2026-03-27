"use client";

import React from "react";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { Button, Input, Label, Badge } from "@neoboard/components";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@neoboard/components";
import type { Transform } from "@/lib/data-transforms";

export interface TransformEditorProps {
  transforms: Transform[];
  onChange: (transforms: Transform[]) => void;
  columns: string[];
  /** Available parameter names for $param_xxx references in filter values and expressions */
  parameterSuggestions?: string[];
}

const TRANSFORM_TYPES = [
  { value: "filter", label: "Filter" },
  { value: "sort", label: "Sort" },
  { value: "groupBy", label: "Group By" },
  { value: "calculatedColumn", label: "Calculated Column" },
  { value: "renameColumns", label: "Rename Columns" },
  { value: "limit", label: "Limit" },
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
              <Label className="text-xs">
                Value{" "}
                {transform.paramRef && (
                  <span className="text-primary">(param)</span>
                )}
              </Label>
              {parameterSuggestions?.length ? (
                <Select
                  value={
                    transform.paramRef
                      ? `$param_${transform.paramRef}`
                      : "__literal__"
                  }
                  onValueChange={(v) => {
                    if (v === "__literal__") {
                      onChange({ ...transform, paramRef: undefined });
                    } else {
                      onChange({
                        ...transform,
                        paramRef: v.replace("$param_", ""),
                        value: "",
                      });
                    }
                  }}
                >
                  <SelectTrigger className="w-[140px] h-8 text-xs">
                    <SelectValue placeholder="Pick value..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__literal__">Static value</SelectItem>
                    {parameterSuggestions.map((p) => (
                      <SelectItem key={p} value={`$param_${p}`}>
                        ${p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              {!transform.paramRef && (
                <Input
                  className="w-[100px] h-8 text-xs"
                  placeholder="Enter value..."
                  value={String(transform.value)}
                  onChange={(e) => {
                    const num = Number(e.target.value);
                    onChange({
                      ...transform,
                      value:
                        !Number.isNaN(num) && e.target.value !== ""
                          ? num
                          : e.target.value,
                    });
                  }}
                />
              )}
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
            <div className="space-y-1">
              <Label className="text-xs">Aggregate</Label>
              <Select
                value={transform.aggregations[0]?.column ?? columns[0]}
                onValueChange={(v) =>
                  onChange({
                    ...transform,
                    aggregations: [{ ...transform.aggregations[0], column: v }],
                  })
                }
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
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Function</Label>
              <Select
                value={transform.aggregations[0]?.fn ?? "count"}
                onValueChange={(v) =>
                  onChange({
                    ...transform,
                    aggregations: [
                      {
                        ...transform.aggregations[0],
                        fn: v as "count" | "sum" | "avg" | "min" | "max",
                      },
                    ],
                  })
                }
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
              <Label className="text-xs">Expression</Label>
              <Input
                className="h-8 text-xs"
                value={transform.expression}
                onChange={(e) =>
                  onChange({ ...transform, expression: e.target.value })
                }
                placeholder="e.g. salary * 0.1"
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
}: TransformEditorProps) {
  const [addType, setAddType] = React.useState<string>("filter");

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
      {transforms.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No transforms configured. Transforms modify query results client-side
          without changing the original query.
        </p>
      )}
      {transforms.map((t, i) => (
        <TransformCard
          key={i}
          transform={t}
          index={i}
          columns={columns}
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
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
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
