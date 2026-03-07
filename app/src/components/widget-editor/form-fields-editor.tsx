"use client";

import React from "react";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
  Checkbox,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
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
import type { FormFieldDef } from "@/lib/form-field-def";
import type { ParameterType } from "@/stores/parameter-store";
import { useAccordionCrud } from "./use-accordion-crud";

interface FormFieldsEditorProps {
  fields: FormFieldDef[];
  onChange: (fields: FormFieldDef[]) => void;
  connectionId: string;
}

function needsSeedQuery(type: ParameterType): boolean {
  return type === "select" || type === "multi-select" || type === "cascading-select";
}

interface LabeledInputProps {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}

function LabeledInput({ label, value, onChange, placeholder, type = "text" }: LabeledInputProps) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-7 text-xs"
      />
    </div>
  );
}

interface SortableFieldItemProps {
  field: FormFieldDef;
  index: number;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<FormFieldDef>) => void;
}

function SortableFieldItem({ field, index, onRemove, onUpdate }: SortableFieldItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
    position: "relative",
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <AccordionItem ref={setNodeRef} style={style} value={field.id} className="border rounded-lg">
      <div className="flex items-center pr-1">
        <button
          type="button"
          className="flex items-center justify-center h-7 w-6 ml-1 cursor-grab text-muted-foreground hover:text-foreground touch-none"
          aria-label={`Drag to reorder field ${index + 1}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <AccordionTrigger className="flex-1 px-3 py-2 text-sm hover:no-underline">
          <span className="flex items-center gap-2">
            Field {index + 1}
            {field.label ? ` — ${field.label}` : " — Untitled"}
            {field.required && (
              <span className="text-destructive">*</span>
            )}
            <Badge variant="outline" className="ml-1 text-xs">
              {field.parameterType}
            </Badge>
          </span>
        </AccordionTrigger>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          aria-label={`Delete field ${index + 1}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove(field.id);
          }}
        >
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>
      <AccordionContent className="px-3 pb-3 space-y-3">
        {/* Label */}
        <LabeledInput
          label="Label"
          value={field.label}
          onChange={(v) => onUpdate(field.id, { label: v })}
          placeholder="e.g. Movie Title"
        />

        {/* Parameter Name */}
        <div className="space-y-1">
          <LabeledInput
            label="Parameter Name"
            value={field.parameterName}
            onChange={(v) => onUpdate(field.id, { parameterName: v })}
            placeholder="e.g. title"
          />
          <p className="text-xs text-muted-foreground">
            Use{" "}
            <code className="font-mono bg-muted px-0.5 rounded">
              $param_{field.parameterName || "…"}
            </code>{" "}
            in your query
          </p>
        </div>

        {/* Input Type */}
        <div className="space-y-1.5">
          <Label className="text-xs">Input Type</Label>
          <Select
            value={field.parameterType}
            onValueChange={(v) =>
              onUpdate(field.id, { parameterType: v as ParameterType })
            }
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="text">Text</SelectItem>
              <SelectItem value="select">Dropdown (Select)</SelectItem>
              <SelectItem value="multi-select">Multi-Select</SelectItem>
              <SelectItem value="date">Date Picker</SelectItem>
              <SelectItem value="date-range">Date Range</SelectItem>
              <SelectItem value="date-relative">Relative Date</SelectItem>
              <SelectItem value="number-range">Number Range (Slider)</SelectItem>
              <SelectItem value="cascading-select">Cascading Select</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Seed query (for select/multi-select/cascading-select) */}
        {needsSeedQuery(field.parameterType) && (
          <div className="space-y-1.5">
            <Label className="text-xs">Options Query</Label>
            <Textarea
              value={field.seedQuery ?? ""}
              onChange={(e) => onUpdate(field.id, { seedQuery: e.target.value })}
              placeholder="SELECT value, label FROM ..."
              rows={3}
              className="text-xs font-mono"
            />
          </div>
        )}

        {/* Parent param (for cascading-select) */}
        {field.parameterType === "cascading-select" && (
          <LabeledInput
            label="Parent Parameter Name"
            value={field.parentParameterName ?? ""}
            onChange={(v) => onUpdate(field.id, { parentParameterName: v })}
            placeholder="e.g. category"
          />
        )}

        {/* Range config (for number-range) */}
        {field.parameterType === "number-range" && (
          <div className="grid grid-cols-3 gap-2">
            <LabeledInput
              label="Min"
              type="number"
              value={field.rangeMin ?? 0}
              onChange={(v) => onUpdate(field.id, { rangeMin: Number(v) })}
            />
            <LabeledInput
              label="Max"
              type="number"
              value={field.rangeMax ?? 100}
              onChange={(v) => onUpdate(field.id, { rangeMax: Number(v) })}
            />
            <LabeledInput
              label="Step"
              type="number"
              value={field.rangeStep ?? 1}
              onChange={(v) => onUpdate(field.id, { rangeStep: Number(v) })}
            />
          </div>
        )}

        {/* Placeholder (for text/select types) */}
        {["text", "select", "multi-select", "cascading-select"].includes(
          field.parameterType,
        ) && (
          <LabeledInput
            label="Placeholder"
            value={field.placeholder ?? ""}
            onChange={(v) => onUpdate(field.id, { placeholder: v })}
            placeholder="Optional placeholder text"
          />
        )}

        {/* Required toggle */}
        <div className="flex items-center gap-2 pt-1">
          <Checkbox
            id={`required-${field.id}`}
            checked={field.required === true}
            onCheckedChange={(checked) =>
              onUpdate(field.id, { required: !!checked })
            }
          />
          <Label htmlFor={`required-${field.id}`} className="text-xs">
            Required
          </Label>
          {!field.required && (
            <span className="text-xs text-muted-foreground">
              (optional — passes null when empty)
            </span>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

export function FormFieldsEditor({ fields, onChange }: FormFieldsEditorProps) {
  const { openItems, setOpenItems, addItem, removeItem, updateItem } =
    useAccordionCrud<FormFieldDef>(fields, onChange);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = fields.findIndex((f) => f.id === active.id);
    const newIndex = fields.findIndex((f) => f.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = [...fields];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    onChange(reordered);
  }

  function addField() {
    addItem(() => ({
      id: crypto.randomUUID(),
      label: "",
      parameterName: "",
      parameterType: "text",
      required: true,
    }));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium uppercase text-muted-foreground tracking-wider">
          Form Fields
        </h4>
        <Button size="sm" variant="outline" onClick={addField}>
          <Plus className="h-3 w-3 mr-1" /> Add Field
        </Button>
      </div>

      {fields.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No fields yet. Add a field to define what inputs appear in the form.
        </p>
      )}

      {fields.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
            <Accordion
              type="multiple"
              value={openItems}
              onValueChange={setOpenItems}
              className="space-y-1"
            >
              {fields.map((field, index) => (
                <SortableFieldItem
                  key={field.id}
                  field={field}
                  index={index}
                  onRemove={removeItem}
                  onUpdate={updateItem}
                />
              ))}
            </Accordion>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
