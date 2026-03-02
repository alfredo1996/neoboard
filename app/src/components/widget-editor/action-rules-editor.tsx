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
  Input,
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

  function ruleSummary(rule: ClickActionRule): string {
    const parts: string[] = [];
    if (rule.triggerColumn) parts.push(rule.triggerColumn);
    if (rule.parameterMapping?.parameterName)
      parts.push(`→ $param_${rule.parameterMapping.parameterName}`);
    if (rule.targetPageId) parts.push("+ navigate");
    return parts.length > 0 ? ` — ${parts.join(" ")}` : "";
  }

  function addRule() {
    const newRule: ClickActionRule = {
      id: crypto.randomUUID(),
      type: "set-parameter",
      triggerColumn: isTable ? availableFields[0] ?? "" : undefined,
      parameterMapping: { parameterName: "", sourceField: availableFields[0] ?? "" },
    };
    onRulesChange([...rules, newRule]);
  }

  function removeRule(id: string) {
    onRulesChange(rules.filter((r) => r.id !== id));
  }

  function updateRule(id: string, updates: Partial<ClickActionRule>) {
    onRulesChange(
      rules.map((r) => (r.id === id ? { ...r, ...updates } : r)),
    );
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

        <Accordion type="multiple" defaultValue={rules.map((r) => r.id)}>
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
                  onClick={() => removeRule(rule.id)}
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
                    {availableFields.length > 0 ? (
                      <Select
                        value={rule.triggerColumn ?? ""}
                        onValueChange={(v) => updateRule(rule.id, { triggerColumn: v })}
                      >
                        <SelectTrigger aria-label="Trigger Column">
                          <SelectValue placeholder="Select column..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableFields.map((f) => (
                            <SelectItem key={f} value={f}>
                              {f}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={rule.triggerColumn ?? ""}
                        onChange={(e) => updateRule(rule.id, { triggerColumn: e.target.value })}
                        placeholder="Column name"
                      />
                    )}
                  </div>
                )}

                {/* Action type */}
                <div className="space-y-1.5">
                  <Label>Action Type</Label>
                  <Select
                    value={rule.type}
                    onValueChange={(v) =>
                      updateRule(rule.id, {
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
                          updateRule(rule.id, {
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
                        {availableFields.length > 0 ? (
                          <Select
                            value={rule.parameterMapping?.sourceField ?? ""}
                            onValueChange={(v) =>
                              updateRule(rule.id, {
                                parameterMapping: {
                                  parameterName: rule.parameterMapping?.parameterName ?? "",
                                  sourceField: v,
                                },
                              })
                            }
                          >
                            <SelectTrigger aria-label="Source Field">
                              <SelectValue placeholder="Select field..." />
                            </SelectTrigger>
                            <SelectContent>
                              {availableFields.map((f) => (
                                <SelectItem key={f} value={f}>
                                  {f}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            value={rule.parameterMapping?.sourceField ?? ""}
                            onChange={(e) =>
                              updateRule(rule.id, {
                                parameterMapping: {
                                  parameterName: rule.parameterMapping?.parameterName ?? "",
                                  sourceField: e.target.value,
                                },
                              })
                            }
                            placeholder="name"
                          />
                        )}
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
                        onValueChange={(v) => updateRule(rule.id, { targetPageId: v })}
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
