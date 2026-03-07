"use client";

import React from "react";
import type { ClickActionRule } from "@/lib/db/schema";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  CreatableCombobox,
  DialogHeader,
  DialogTitle,
} from "@neoboard/components";
import { useAccordionCrud } from "./use-accordion-crud";
import { FieldSelectorInput } from "./field-selector-input";

interface ActionRulesEditorProps {
  rules: ClickActionRule[];
  onRulesChange: (rules: ClickActionRule[]) => void;
  onBack: () => void;
  chartType: string;
  availableFields: string[];
  parameterSuggestions: string[];
  pages: { id: string; title: string }[];
}

export function ActionRulesEditor({
  rules,
  onRulesChange,
  onBack,
  chartType,
  availableFields,
  parameterSuggestions,
  pages,
}: ActionRulesEditorProps) {
  const isTable = chartType === "table";

  const { openItems, setOpenItems, addItem, removeItem, updateItem } =
    useAccordionCrud<ClickActionRule>(rules, onRulesChange);

  function ruleSummary(rule: ClickActionRule): string {
    const parts: string[] = [];
    if (rule.triggerColumn) parts.push(rule.triggerColumn);
    if (rule.parameterMapping?.parameterName)
      parts.push(`→ $param_${rule.parameterMapping.parameterName}`);
    if (rule.targetPageId) parts.push("+ navigate");
    return parts.length > 0 ? ` — ${parts.join(" ")}` : "";
  }

  function addRule() {
    addItem(() => ({
      id: crypto.randomUUID(),
      type: "set-parameter",
      triggerColumn: isTable ? availableFields[0] ?? "" : undefined,
      parameterMapping: { parameterName: "", sourceField: availableFields[0] ?? "" },
    }));
  }

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack} aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <DialogTitle>Action Rules</DialogTitle>
        </div>
      </DialogHeader>

      <div className="py-4 space-y-4 max-h-[60vh] overflow-y-auto">
        {rules.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">
            No action rules yet. Add one to get started.
          </p>
        )}

        <Accordion type="multiple" value={openItems} onValueChange={setOpenItems}>
          {rules.map((rule, index) => (
            <AccordionItem key={rule.id} value={rule.id} className="border rounded-lg">
              <div className="flex items-center pr-2">
                <AccordionTrigger className="flex-1 px-4 py-3 text-sm font-medium">
                  Rule {index + 1}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    {ruleSummary(rule)}
                  </span>
                </AccordionTrigger>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeItem(rule.id)}
                  aria-label={`Delete rule ${index + 1}`}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
              <AccordionContent className="px-4 pb-4 space-y-3">
                {/* Trigger column — for tables only */}
                {isTable && (
                  <div className="space-y-1.5">
                    <Label>Trigger Column</Label>
                    <FieldSelectorInput
                      value={rule.triggerColumn ?? ""}
                      onChange={(v) => updateItem(rule.id, { triggerColumn: v })}
                      fields={availableFields}
                      label="Trigger Column"
                      placeholder="Select column..."
                    />
                  </div>
                )}

                {/* Action type */}
                <div className="space-y-1.5">
                  <Label>Action Type</Label>
                  <Select
                    value={rule.type}
                    onValueChange={(v) =>
                      updateItem(rule.id, {
                        type: v as ClickActionRule["type"],
                      })
                    }
                  >
                    <SelectTrigger aria-label="Action Type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="set-parameter">Set Parameter</SelectItem>
                      <SelectItem value="navigate-to-page">Navigate to Page</SelectItem>
                      <SelectItem value="set-parameter-and-navigate">Set Parameter & Navigate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Parameter name */}
                {(rule.type === "set-parameter" || rule.type === "set-parameter-and-navigate") && (
                  <>
                    <div className="space-y-1.5">
                      <Label>Parameter Name</Label>
                      <CreatableCombobox
                        suggestions={parameterSuggestions}
                        value={rule.parameterMapping?.parameterName ?? ""}
                        onChange={(v) =>
                          updateItem(rule.id, {
                            parameterMapping: {
                              parameterName: v,
                              sourceField: rule.parameterMapping?.sourceField ?? "",
                            },
                          })
                        }
                        placeholder="param_name"
                      />
                    </div>

                    {/* Source field — for non-table chart types */}
                    {!isTable && (
                      <div className="space-y-1.5">
                        <Label>Source Field</Label>
                        <FieldSelectorInput
                          value={rule.parameterMapping?.sourceField ?? ""}
                          onChange={(v) =>
                            updateItem(rule.id, {
                              parameterMapping: {
                                parameterName: rule.parameterMapping?.parameterName ?? "",
                                sourceField: v,
                              },
                            })
                          }
                          fields={availableFields}
                          label="Source Field"
                          placeholder="Select field..."
                        />
                      </div>
                    )}
                  </>
                )}

                {/* Target page */}
                {(rule.type === "navigate-to-page" || rule.type === "set-parameter-and-navigate") && (
                  <div className="space-y-1.5">
                    <Label>Target Page</Label>
                    {pages.length > 0 ? (
                      <Select
                        value={rule.targetPageId ?? ""}
                        onValueChange={(v) => updateItem(rule.id, { targetPageId: v })}
                      >
                        <SelectTrigger aria-label="Target Page">
                          <SelectValue placeholder="Select a page..." />
                        </SelectTrigger>
                        <SelectContent>
                          {pages.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Add more pages to the dashboard to enable navigation.
                      </p>
                    )}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

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
