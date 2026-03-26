"use client";

import React from "react";
import type { StylingRule, StylingOperator } from "@/lib/db/schema";
import { getOperatorGroups } from "@neoboard/components/charts";
import { useWidgetEditorStore } from "@/stores/widget-editor-store";
import { getStylingTargets } from "@/lib/chart-registry";
import { ArrowLeft, GripVertical, Plus, Trash2, Bold } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  DialogHeader,
  DialogTitle,
} from "@neoboard/components";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAccordionCrud } from "./use-accordion-crud";
import { FieldSelectorInput } from "./field-selector-input";
import { ValueOrParamInput } from "./value-or-param-input";

// Operator groups derived from the shared registry (single source of truth)
const OPERATOR_GROUPS = getOperatorGroups();

const NULL_OPS = new Set<StylingOperator>(["is_null", "is_not_null"]);
const STRING_OPS = new Set<StylingOperator>([
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
]);

interface StylingRulesEditorProps {
  onBack: () => void;
}

function ruleSummary(rule: StylingRule): string {
  const col = rule.column ? `${rule.column} ` : "";
  const op = rule.operator ?? "<=";
  if (NULL_OPS.has(op)) return `${col}${op.replace("_", " ")}`;
  const val = rule.parameterRef
    ? `$param_${rule.parameterRef}`
    : String(rule.value);
  if (op === "between") {
    const valTo = rule.parameterRefTo
      ? `$param_${rule.parameterRefTo}`
      : String(rule.valueTo ?? "?");
    return `${col}between ${val} and ${valTo}`;
  }
  return `${col}${op.replace("_", " ")} ${val}`;
}

interface SortableRuleItemProps {
  rule: StylingRule;
  index: number;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<StylingRule>) => void;
  parameterSuggestions: string[];
  stylingTargets: { value: string; label: string }[];
  isTable: boolean;
  availableFields: string[];
}

function SortableRuleItem({
  rule,
  index,
  onRemove,
  onUpdate,
  parameterSuggestions,
  stylingTargets,
  isTable,
  availableFields,
}: SortableRuleItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: rule.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
    position: "relative",
    zIndex: isDragging ? 10 : undefined,
  };

  const inputType = STRING_OPS.has(rule.operator) ? "text" : "number";
  const valuePlaceholder = STRING_OPS.has(rule.operator) ? "text value" : "0";

  return (
    <AccordionItem
      ref={setNodeRef}
      style={style}
      value={rule.id}
      className="border rounded-lg"
    >
      <div className="flex items-center pr-2">
        <button
          type="button"
          className="flex items-center justify-center h-9 w-6 ml-1 cursor-grab text-muted-foreground hover:text-foreground touch-none"
          aria-label={`Drag to reorder rule ${index + 1}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <AccordionTrigger className="flex-1 px-2 py-3 text-sm font-medium">
          Rule {index + 1}
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            {" — "}
            {ruleSummary(rule)}{" "}
            <span
              className="inline-block w-3 h-3 rounded-sm border align-middle"
              style={{ backgroundColor: rule.color }}
            />
            {rule.bold && <span className="ml-1 font-bold">B</span>}
          </span>
        </AccordionTrigger>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRemove(rule.id)}
          aria-label={`Delete rule ${index + 1}`}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
      <AccordionContent className="px-4 pb-4 space-y-3">
        {/* Column — per-rule column selector for tables */}
        {isTable && (
          <div className="space-y-1.5">
            <Label>Column</Label>
            <FieldSelectorInput
              value={rule.column ?? ""}
              onChange={(v) => onUpdate(rule.id, { column: v || undefined })}
              fields={availableFields}
              label="Column"
              placeholder="Auto (first numeric)"
            />
          </div>
        )}

        {/* Operator */}
        <div className="space-y-1.5">
          <Label>Operator</Label>
          <Select
            value={rule.operator ?? "<="}
            onValueChange={(v) =>
              onUpdate(rule.id, { operator: v as StylingOperator })
            }
          >
            <SelectTrigger aria-label="Operator">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPERATOR_GROUPS.map((group) => (
                <SelectGroup key={group.label}>
                  <SelectLabel>{group.label}</SelectLabel>
                  {group.operators.map((op) => (
                    <SelectItem key={op.value} value={op.value}>
                      {op.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Compare against: Value or Parameter — hidden for null ops */}
        {!NULL_OPS.has(rule.operator) && rule.operator !== "between" && (
          <div className="space-y-1.5">
            <Label>Compare Against</Label>
            <ValueOrParamInput
              parameterRef={rule.parameterRef}
              onParamRefChange={(ref) =>
                onUpdate(rule.id, { parameterRef: ref })
              }
              value={rule.value}
              onValueChange={(v) => onUpdate(rule.id, { value: v })}
              parameterSuggestions={parameterSuggestions}
              inputType={inputType}
              placeholder={valuePlaceholder}
            />
          </div>
        )}

        {/* Between: two-bound range input */}
        {rule.operator === "between" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>From (min)</Label>
              <ValueOrParamInput
                parameterRef={rule.parameterRef}
                onParamRefChange={(ref) =>
                  onUpdate(rule.id, { parameterRef: ref })
                }
                value={rule.value}
                onValueChange={(v) => onUpdate(rule.id, { value: v })}
                parameterSuggestions={parameterSuggestions}
              />
            </div>
            <div className="space-y-1.5">
              <Label>To (max)</Label>
              <ValueOrParamInput
                parameterRef={rule.parameterRefTo}
                onParamRefChange={(ref) =>
                  onUpdate(rule.id, { parameterRefTo: ref })
                }
                value={rule.valueTo ?? ""}
                onValueChange={(v) => onUpdate(rule.id, { valueTo: v })}
                parameterSuggestions={parameterSuggestions}
                placeholder="100"
              />
            </div>
          </div>
        )}

        {/* Color */}
        <div className="space-y-1.5">
          <Label>Color</Label>
          <div className="flex items-center gap-2">
            <Input
              value={rule.color}
              onChange={(e) => onUpdate(rule.id, { color: e.target.value })}
              placeholder="#3b82f6"
              className="flex-1"
            />
            <input
              type="color"
              value={rule.color}
              onChange={(e) => onUpdate(rule.id, { color: e.target.value })}
              className="h-9 w-9 rounded border cursor-pointer"
              aria-label="Pick color"
            />
          </div>
        </div>

        {/* Bold */}
        <button
          type="button"
          className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors ${
            rule.bold
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-muted-foreground border-input hover:bg-accent"
          }`}
          onClick={() => onUpdate(rule.id, { bold: !rule.bold })}
          aria-label="Toggle bold"
          aria-pressed={!!rule.bold}
        >
          <Bold className="h-3.5 w-3.5" />
          Bold
        </button>

        {/* Target — only when multiple targets available */}
        {stylingTargets.length > 1 && (
          <div className="space-y-1.5">
            <Label>Target</Label>
            <Select
              value={rule.target ?? stylingTargets[0]?.value ?? "color"}
              onValueChange={(v) =>
                onUpdate(rule.id, {
                  target: v as StylingRule["target"],
                })
              }
            >
              <SelectTrigger aria-label="Target">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {stylingTargets.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

export function StylingRulesEditor({ onBack }: StylingRulesEditorProps) {
  const rules = useWidgetEditorStore((s) => s.stylingRules);
  const onRulesChange = useWidgetEditorStore((s) => s.setStylingRules);
  const chartType = useWidgetEditorStore((s) => s.chartType);
  const availableFields = useWidgetEditorStore((s) => s.availableFields);
  const parameterSuggestions = useWidgetEditorStore(
    (s) => s.parameterSuggestions,
  );
  const stylingTargets = getStylingTargets(chartType);
  const isTable = chartType === "table";

  const { openItems, setOpenItems, addItem, removeItem, updateItem } =
    useAccordionCrud<StylingRule>(rules, onRulesChange);

  function addRule() {
    addItem(() => ({
      id: crypto.randomUUID(),
      operator: "<=",
      value: 0,
      color: "#3b82f6",
      target: (stylingTargets[0]?.value as StylingRule["target"]) ?? "color",
    }));
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = rules.findIndex((r) => r.id === active.id);
    const newIndex = rules.findIndex((r) => r.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = [...rules];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    onRulesChange(reordered);
  }

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack} aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <DialogTitle>Styling Rules</DialogTitle>
        </div>
      </DialogHeader>

      <div className="py-4 space-y-4 max-h-[60vh] overflow-y-auto">
        {rules.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">
            No styling rules yet. Add one to get started.
          </p>
        )}

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={rules.map((r) => r.id)}
            strategy={verticalListSortingStrategy}
          >
            <Accordion
              type="multiple"
              value={openItems}
              onValueChange={setOpenItems}
            >
              {rules.map((rule, index) => (
                <SortableRuleItem
                  key={rule.id}
                  rule={rule}
                  index={index}
                  onRemove={removeItem}
                  onUpdate={updateItem}
                  parameterSuggestions={parameterSuggestions}
                  stylingTargets={stylingTargets}
                  isTable={isTable}
                  availableFields={availableFields}
                />
              ))}
            </Accordion>
          </SortableContext>
        </DndContext>

        <Button
          variant="outline"
          size="sm"
          onClick={addRule}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Add Rule
        </Button>
      </div>

      <div className="flex justify-end pt-2 border-t">
        <Button onClick={onBack}>Done</Button>
      </div>
    </>
  );
}
