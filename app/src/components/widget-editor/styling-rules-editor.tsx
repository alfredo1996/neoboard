"use client";

import React from "react";
import type { StylingRule, StylingOperator } from "@/lib/db/schema";
import { ArrowLeft, GripVertical, Plus, Trash2 } from "lucide-react";
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

const OPERATOR_GROUPS: { label: string; operators: { value: StylingOperator; label: string }[] }[] = [
  {
    label: "Numeric",
    operators: [
      { value: "<=", label: "<= (less or equal)" },
      { value: ">=", label: ">= (greater or equal)" },
      { value: "<", label: "< (less than)" },
      { value: ">", label: "> (greater than)" },
      { value: "==", label: "== (equals)" },
      { value: "!=", label: "!= (not equal)" },
      { value: "between", label: "between" },
    ],
  },
  {
    label: "Text",
    operators: [
      { value: "contains", label: "contains" },
      { value: "not_contains", label: "not contains" },
      { value: "starts_with", label: "starts with" },
      { value: "ends_with", label: "ends with" },
    ],
  },
  {
    label: "Null",
    operators: [
      { value: "is_null", label: "is null" },
      { value: "is_not_null", label: "is not null" },
    ],
  },
];

const NULL_OPS = new Set<StylingOperator>(["is_null", "is_not_null"]);
const STRING_OPS = new Set<StylingOperator>(["contains", "not_contains", "starts_with", "ends_with"]);

interface StylingRulesEditorProps {
  rules: StylingRule[];
  onRulesChange: (rules: StylingRule[]) => void;
  onBack: () => void;
  chartType: string;
  targetColumn: string;
  onTargetColumnChange: (col: string) => void;
  availableFields: string[];
  parameterSuggestions: string[];
  stylingTargets: { value: string; label: string }[];
}

function ruleSummary(rule: StylingRule): string {
  const op = rule.operator ?? "<=";
  if (NULL_OPS.has(op)) return op.replace("_", " ");
  const val = rule.parameterRef
    ? `$param_${rule.parameterRef}`
    : String(rule.value);
  if (op === "between") {
    const valTo = rule.parameterRefTo
      ? `$param_${rule.parameterRefTo}`
      : String(rule.valueTo ?? "?");
    return `between ${val} and ${valTo}`;
  }
  return `${op.replace("_", " ")} ${val}`;
}

interface SortableRuleItemProps {
  rule: StylingRule;
  index: number;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<StylingRule>) => void;
  parameterSuggestions: string[];
  stylingTargets: { value: string; label: string }[];
}

function SortableRuleItem({
  rule,
  index,
  onRemove,
  onUpdate,
  parameterSuggestions,
  stylingTargets,
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
    <AccordionItem ref={setNodeRef} style={style} value={rule.id} className="border rounded-lg">
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
            {" — "}{ruleSummary(rule)}{" "}
            <span
              className="inline-block w-3 h-3 rounded-sm border align-middle"
              style={{ backgroundColor: rule.color }}
            />
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
            onParamRefChange={(ref) => onUpdate(rule.id, { parameterRef: ref })}
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
              onParamRefChange={(ref) => onUpdate(rule.id, { parameterRef: ref })}
              value={rule.value}
              onValueChange={(v) => onUpdate(rule.id, { value: v })}
              parameterSuggestions={parameterSuggestions}
            />
          </div>
          <div className="space-y-1.5">
            <Label>To (max)</Label>
            <ValueOrParamInput
              parameterRef={rule.parameterRefTo}
              onParamRefChange={(ref) => onUpdate(rule.id, { parameterRefTo: ref })}
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
              onChange={(e) =>
                onUpdate(rule.id, { color: e.target.value })
              }
              placeholder="#3b82f6"
              className="flex-1"
            />
            <input
              type="color"
              value={rule.color}
              onChange={(e) =>
                onUpdate(rule.id, { color: e.target.value })
              }
              className="h-9 w-9 rounded border cursor-pointer"
              aria-label="Pick color"
            />
          </div>
        </div>

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

export function StylingRulesEditor({
  rules,
  onRulesChange,
  onBack,
  chartType,
  targetColumn,
  onTargetColumnChange,
  availableFields,
  parameterSuggestions,
  stylingTargets,
}: StylingRulesEditorProps) {
  const isTable = chartType === "table";

  const { openItems, setOpenItems, addItem, removeItem, updateItem } =
    useAccordionCrud<StylingRule>(rules, onRulesChange);

  function addRule() {
    addItem(() => ({
      id: crypto.randomUUID(),
      operator: "<=",
      value: 0,
      color: "#3b82f6",
      target: stylingTargets[0]?.value as StylingRule["target"] ?? "color",
    }));
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
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
        {/* Target column selector — for tables only */}
        {isTable && (
          <div className="space-y-1.5">
            <Label>Target Column</Label>
            <p className="text-xs text-muted-foreground">
              Column to evaluate rules against. Leave blank to use the first numeric column.
            </p>
            <FieldSelectorInput
              value={targetColumn}
              onChange={onTargetColumnChange}
              fields={availableFields}
              label="Target Column"
              placeholder="Auto (first numeric)"
            />
          </div>
        )}

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
          <SortableContext items={rules.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            <Accordion type="multiple" value={openItems} onValueChange={setOpenItems}>
              {rules.map((rule, index) => (
                <SortableRuleItem
                  key={rule.id}
                  rule={rule}
                  index={index}
                  onRemove={removeItem}
                  onUpdate={updateItem}
                  parameterSuggestions={parameterSuggestions}
                  stylingTargets={stylingTargets}
                />
              ))}
            </Accordion>
          </SortableContext>
        </DndContext>

        <Button variant="outline" size="sm" onClick={addRule} className="w-full">
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
