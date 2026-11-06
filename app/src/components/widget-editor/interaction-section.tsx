"use client";

import type { ReactNode } from "react";
import type { ClickActionRule } from "@/lib/db/schema";
import { useWidgetEditorStore } from "@/stores/widget-editor-store";
import {
  Button,
  CreatableCombobox,
  SegmentedControl,
  SettingRow,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Alert,
  AlertTitle,
  AlertDescription,
} from "@neoboard/components";
import { Info, Plus, Trash2 } from "lucide-react";
import { randomId } from "@/lib/random-id";
import {
  addItemToList,
  removeItemFromList,
  updateItemInList,
} from "./use-accordion-crud";
import { FieldSelectorInput } from "./field-selector-input";

export interface InteractionSectionProps {
  clickActionCollisions: { widgetId: string; title: string }[];
  pages: { id: string; title: string }[];
}

type RuleType = ClickActionRule["type"];

const THEN_OPTIONS: { value: RuleType; label: string }[] = [
  { value: "set-parameter", label: "Set parameter" },
  { value: "navigate-to-page", label: "Open page" },
  { value: "set-parameter-and-navigate", label: "Both" },
];

const setsParameter = (t: RuleType) => t !== "navigate-to-page";
const opensPage = (t: RuleType) => t !== "set-parameter";

/** What a click does, in words that follow the rule's inputs (#2406). */
export function ruleSentence(
  rule: ClickActionRule,
  isTable: boolean,
  pageTitle: string | undefined,
): ReactNode {
  const source = isTable
    ? rule.triggerColumn
    : rule.parameterMapping?.sourceField;
  const name = rule.parameterMapping?.parameterName;
  const what = isTable ? (
    <>
      a cell in <b>{rule.triggerColumn || "…"}</b>
    </>
  ) : (
    "a mark"
  );
  const set = (
    <>
      sets {name ? <code>${name}</code> : "a parameter"} to its{" "}
      {!isTable && source ? <b>{source}</b> : "value"}
    </>
  );
  const open = <>opens {pageTitle ? <b>{pageTitle}</b> : "a page"}</>;
  if (rule.type === "set-parameter")
    return (
      <>
        Clicking {what} {set}.
      </>
    );
  if (rule.type === "navigate-to-page")
    return (
      <>
        Clicking {what} {open}.
      </>
    );
  return (
    <>
      Clicking {what} {set} and {open}.
    </>
  );
}

interface RuleGroupProps {
  rule: ClickActionRule;
  index: number;
  isTable: boolean;
  pages: { id: string; title: string }[];
  fields: string[];
  parameterSuggestions: string[];
  onChange: (patch: Partial<ClickActionRule>) => void;
  onDelete: () => void;
}

function RuleGroup({
  rule,
  index,
  isTable,
  pages,
  fields,
  parameterSuggestions,
  onChange,
  onDelete,
}: Readonly<RuleGroupProps>) {
  const n = index + 1;
  const pageTitle = pages.find((p) => p.id === rule.targetPageId)?.title;
  const mapping = rule.parameterMapping;
  const setMapping = (patch: Partial<NonNullable<typeof mapping>>) =>
    onChange({
      parameterMapping: {
        parameterName: mapping?.parameterName ?? "",
        sourceField: mapping?.sourceField ?? "",
        ...patch,
      },
    });

  return (
    <div
      role="group"
      aria-label={`Rule ${n}`}
      className="grid gap-3 rounded-md border p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="pt-1 text-body text-foreground-2 [&_b]:font-semibold [&_b]:text-foreground [&_code]:text-foreground">
          {ruleSentence(rule, isTable, pageTitle)}
        </p>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          aria-label={`Delete rule ${n}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {isTable ? (
        <SettingRow label="Column">
          <FieldSelectorInput
            value={rule.triggerColumn ?? ""}
            onChange={(v) => onChange({ triggerColumn: v })}
            fields={fields}
            label="Column"
            placeholder="Select column..."
          />
        </SettingRow>
      ) : (
        <SettingRow label="Value from">
          <FieldSelectorInput
            value={mapping?.sourceField ?? ""}
            onChange={(v) => setMapping({ sourceField: v })}
            fields={fields}
            label="Value from"
            placeholder="Select field..."
          />
        </SettingRow>
      )}
      <SettingRow label="Then" labelId={`rule-${rule.id}-then`} wraps>
        <SegmentedControl
          aria-labelledby={`rule-${rule.id}-then`}
          value={rule.type}
          onValueChange={(v) => onChange({ type: v as RuleType })}
          options={THEN_OPTIONS}
        />
      </SettingRow>
      {setsParameter(rule.type) && (
        <SettingRow label="Parameter" htmlFor={`rule-${rule.id}-param`}>
          <span className="flex w-full items-center gap-1.5">
            <span aria-hidden className="font-mono text-muted-foreground">
              $
            </span>
            <CreatableCombobox
              id={`rule-${rule.id}-param`}
              suggestions={parameterSuggestions}
              value={mapping?.parameterName ?? ""}
              onChange={(v) => setMapping({ parameterName: v })}
              placeholder="name"
            />
          </span>
        </SettingRow>
      )}
      {opensPage(rule.type) && (
        <SettingRow label="Page">
          {pages.length > 0 ? (
            <Select
              value={rule.targetPageId ?? ""}
              onValueChange={(v) => onChange({ targetPageId: v })}
            >
              <SelectTrigger aria-label="Page">
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
            <p className="text-meta text-muted-foreground">
              Add more pages to the dashboard to enable navigation.
            </p>
          )}
        </SettingRow>
      )}
    </div>
  );
}

/** Behavior → Interaction: what a click on the widget does (#2388, #2406). */
export function InteractionSection({
  clickActionCollisions,
  pages,
}: Readonly<InteractionSectionProps>) {
  const clickActionEnabled = useWidgetEditorStore((s) => s.clickActionEnabled);
  const setClickActionEnabled = useWidgetEditorStore(
    (s) => s.setClickActionEnabled,
  );
  const rules = useWidgetEditorStore((s) => s.actionRules);
  const setRules = useWidgetEditorStore((s) => s.setActionRules);
  const chartType = useWidgetEditorStore((s) => s.chartType);
  const availableFields = useWidgetEditorStore((s) => s.availableFields);
  const parameterSuggestions = useWidgetEditorStore(
    (s) => s.parameterSuggestions,
  );
  const isTable = chartType === "table";

  function addRule() {
    setRules(
      addItemToList(rules, () => ({
        id: randomId(),
        type: "set-parameter",
        triggerColumn: isTable ? (availableFields[0] ?? "") : undefined,
        parameterMapping: {
          parameterName: "",
          sourceField: availableFields[0] ?? "",
        },
      })),
    );
  }

  return (
    <>
      <SettingRow
        label="Click action"
        htmlFor="click-action-enabled"
        help="Sets a parameter or opens a page on click."
        compact
      >
        <Switch
          stateLabel
          id="click-action-enabled"
          checked={clickActionEnabled}
          onCheckedChange={setClickActionEnabled}
        />
      </SettingRow>
      {clickActionEnabled && (
        <div className="grid gap-2">
          {rules.map((rule, i) => (
            <RuleGroup
              key={rule.id}
              rule={rule}
              index={i}
              isTable={isTable}
              pages={pages}
              fields={availableFields}
              parameterSuggestions={parameterSuggestions}
              onChange={(patch) =>
                setRules(updateItemInList(rules, rule.id, patch))
              }
              onDelete={() => setRules(removeItemFromList(rules, rule.id))}
            />
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={addRule}
            className="justify-self-start"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add rule
          </Button>
        </div>
      )}
      {clickActionEnabled && clickActionCollisions.length > 0 && (
        <Alert
          variant="default"
          className="py-2"
          data-testid="click-action-collision-banner"
        >
          <Info className="h-4 w-4" />
          <AlertTitle className="text-sm">
            Parameter name already in use
          </AlertTitle>
          <AlertDescription className="text-xs">
            {clickActionCollisions.length === 1
              ? `A parameter set here is also set by: ${clickActionCollisions[0].title}.`
              : `Parameters set here are also set by: ${clickActionCollisions.map((c) => c.title).join(", ")}.`}{" "}
            Multiple widgets writing to the same parameter may conflict.
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}
