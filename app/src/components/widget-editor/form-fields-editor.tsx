"use client";

import React, { useCallback, useState } from "react";
import { Plus, Trash2, GripVertical } from "lucide-react";
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
import type { FormFieldDef } from "@/lib/form-field-def";
import type { ParameterType } from "@/stores/parameter-store";

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

export function FormFieldsEditor({ fields, onChange }: FormFieldsEditorProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const addField = useCallback(() => {
    const newField: FormFieldDef = {
      id: crypto.randomUUID(),
      label: "",
      parameterName: "",
      parameterType: "text",
      required: true,
    };
    onChange([...fields, newField]);
  }, [fields, onChange]);

  const removeField = useCallback(
    (id: string) => {
      onChange(fields.filter((f) => f.id !== id));
    },
    [fields, onChange],
  );

  const updateField = useCallback(
    (id: string, patch: Partial<FormFieldDef>) => {
      onChange(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    },
    [fields, onChange],
  );

  const reorderFields = useCallback(
    (from: number, to: number) => {
      if (from === to) return;
      const next = [...fields];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      onChange(next);
    },
    [fields, onChange],
  );

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
        <Accordion
          type="multiple"
          defaultValue={[]}
          className="space-y-1"
        >
          {fields.map((field, index) => (
            <div
              key={field.id}
              draggable
              onDragStart={(e) => {
                setDragIndex(index);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", String(index));
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDropIndex(index);
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setDropIndex(null);
              }}
              onDrop={(e) => {
                reorderFields(
                  parseInt(e.dataTransfer.getData("text/plain"), 10),
                  index,
                );
                setDragIndex(null);
                setDropIndex(null);
              }}
              className={
                dropIndex === index && dragIndex !== null && dragIndex !== index
                  ? "rounded-lg border-l-2 border-primary group"
                  : "rounded-lg group"
              }
            >
              <AccordionItem
                value={field.id}
                className="border rounded-lg"
              >
                <div className="flex items-center pr-1">
                  <span className="pl-2 cursor-grab active:cursor-grabbing text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                    <GripVertical className="h-3.5 w-3.5" />
                  </span>
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
                      removeField(field.id);
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
                    onChange={(v) => updateField(field.id, { label: v })}
                    placeholder="e.g. Movie Title"
                  />

                  {/* Parameter Name */}
                  <div className="space-y-1">
                    <LabeledInput
                      label="Parameter Name"
                      value={field.parameterName}
                      onChange={(v) =>
                        updateField(field.id, { parameterName: v })
                      }
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
                        updateField(field.id, {
                          parameterType: v as ParameterType,
                        })
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
                        <SelectItem value="date-relative">
                          Relative Date
                        </SelectItem>
                        <SelectItem value="number-range">
                          Number Range (Slider)
                        </SelectItem>
                        <SelectItem value="cascading-select">
                          Cascading Select
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Seed query (for select/multi-select/cascading-select) */}
                  {needsSeedQuery(field.parameterType) && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Options Query</Label>
                      <Textarea
                        value={field.seedQuery ?? ""}
                        onChange={(e) =>
                          updateField(field.id, { seedQuery: e.target.value })
                        }
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
                      onChange={(v) =>
                        updateField(field.id, { parentParameterName: v })
                      }
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
                        onChange={(v) =>
                          updateField(field.id, { rangeMin: Number(v) })
                        }
                      />
                      <LabeledInput
                        label="Max"
                        type="number"
                        value={field.rangeMax ?? 100}
                        onChange={(v) =>
                          updateField(field.id, { rangeMax: Number(v) })
                        }
                      />
                      <LabeledInput
                        label="Step"
                        type="number"
                        value={field.rangeStep ?? 1}
                        onChange={(v) =>
                          updateField(field.id, { rangeStep: Number(v) })
                        }
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
                      onChange={(v) =>
                        updateField(field.id, { placeholder: v })
                      }
                      placeholder="Optional placeholder text"
                    />
                  )}

                  {/* Required toggle */}
                  <div className="flex items-center gap-2 pt-1">
                    <Checkbox
                      id={`required-${field.id}`}
                      checked={field.required === true}
                      onCheckedChange={(checked) =>
                        updateField(field.id, { required: !!checked })
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
            </div>
          ))}
        </Accordion>
      )}
    </div>
  );
}
