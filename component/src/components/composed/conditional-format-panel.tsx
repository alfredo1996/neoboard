import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Trash2, Plus } from "lucide-react";
import type { CellFormatRule, ColorScaleConfig, StylingOperator } from "@/charts/styling-rule";

export interface ConditionalFormatPanelProps {
  columns: string[];
  rules: CellFormatRule[];
  colorScales: ColorScaleConfig[];
  onRulesChange: (rules: CellFormatRule[]) => void;
  onColorScalesChange: (scales: ColorScaleConfig[]) => void;
}

const OPERATORS: { value: StylingOperator; label: string }[] = [
  { value: ">", label: ">" },
  { value: ">=", label: ">=" },
  { value: "<", label: "<" },
  { value: "<=", label: "<=" },
  { value: "==", label: "==" },
  { value: "!=", label: "!=" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "not contains" },
  { value: "starts_with", label: "starts with" },
  { value: "ends_with", label: "ends with" },
  { value: "between", label: "between" },
  { value: "is_null", label: "is null" },
  { value: "is_not_null", label: "is not null" },
];

const ICON_OPTIONS = [
  { value: "__none", label: "None" },
  { value: "check", label: "Check" },
  { value: "x", label: "X" },
  { value: "alert-triangle", label: "Warning" },
  { value: "arrow-up", label: "Arrow Up" },
  { value: "arrow-down", label: "Arrow Down" },
];

let nextId = 1;
function generateId(): string {
  return `cf-${nextId++}-${Date.now()}`;
}

function RuleRow({
  rule,
  columns,
  onChange,
  onRemove,
}: {
  rule: CellFormatRule;
  columns: string[];
  onChange: (updated: CellFormatRule) => void;
  onRemove: () => void;
}) {
  const needsValue = !["is_null", "is_not_null"].includes(rule.operator);
  const needsSecondValue = rule.operator === "between";
  const isNumericOperator = [">", ">=", "<", "<=", "==", "!=", "between"].includes(rule.operator);

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
      <div className="space-y-1">
        <Label className="text-xs">Column</Label>
        <Select value={rule.column} onValueChange={(v) => onChange({ ...rule, column: v })}>
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {columns.map((col) => (
              <SelectItem key={col} value={col}>{col}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Operator</Label>
        <Select
          value={rule.operator}
          onValueChange={(v) => onChange({ ...rule, operator: v as StylingOperator })}
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OPERATORS.map((op) => (
              <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {needsValue && (
        <div className="space-y-1">
          <Label className="text-xs">Value</Label>
          <Input
            className="w-[100px]"
            value={String(rule.value ?? "")}
            onChange={(e) => {
              if (isNumericOperator) {
                const num = Number(e.target.value);
                onChange({ ...rule, value: !Number.isNaN(num) && e.target.value !== "" ? num : e.target.value });
              } else {
                onChange({ ...rule, value: e.target.value });
              }
            }}
          />
        </div>
      )}

      {needsSecondValue && (
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input
            className="w-[100px]"
            value={String(rule.valueTo ?? "")}
            onChange={(e) => {
              const num = Number(e.target.value);
              onChange({ ...rule, valueTo: !Number.isNaN(num) && e.target.value !== "" ? num : e.target.value });
            }}
          />
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-xs">Bg Color</Label>
        <Input
          type="color"
          className="w-[48px] h-9 p-1 cursor-pointer"
          value={rule.style.backgroundColor ?? "#ffffff"}
          onChange={(e) =>
            onChange({ ...rule, style: { ...rule.style, backgroundColor: e.target.value } })
          }
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Text</Label>
        <Input
          type="color"
          className="w-[48px] h-9 p-1 cursor-pointer"
          value={rule.style.textColor ?? "#000000"}
          onChange={(e) =>
            onChange({ ...rule, style: { ...rule.style, textColor: e.target.value } })
          }
        />
      </div>

      <div className="flex items-center gap-1.5 pb-0.5">
        <Switch
          id={`bold-${rule.id}`}
          checked={rule.style.bold ?? false}
          onCheckedChange={(checked) =>
            onChange({ ...rule, style: { ...rule.style, bold: checked } })
          }
        />
        <Label htmlFor={`bold-${rule.id}`} className="text-xs">Bold</Label>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Icon</Label>
        <Select
          value={rule.style.icon ?? "__none"}
          onValueChange={(v) => onChange({ ...rule, style: { ...rule.style, icon: v === "__none" ? undefined : v } })}
        >
          <SelectTrigger className="w-[100px]">
            <SelectValue placeholder="None" />
          </SelectTrigger>
          <SelectContent>
            {ICON_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={onRemove} aria-label="Remove rule">
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}

function ColorScaleRow({
  scale,
  columns,
  onChange,
  onRemove,
}: {
  scale: ColorScaleConfig;
  columns: string[];
  onChange: (updated: ColorScaleConfig) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-end gap-2 rounded-lg border p-3">
      <div className="space-y-1">
        <Label className="text-xs">Column</Label>
        <Select value={scale.column} onValueChange={(v) => onChange({ ...scale, column: v })}>
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {columns.map((col) => (
              <SelectItem key={col} value={col}>{col}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Min Color</Label>
        <Input
          type="color"
          className="w-[48px] h-9 p-1 cursor-pointer"
          value={scale.minColor}
          onChange={(e) => onChange({ ...scale, minColor: e.target.value })}
        />
      </div>

      <div
        className="h-9 flex-1 min-w-[60px] rounded-md border"
        style={{
          background: `linear-gradient(to right, ${scale.minColor}, ${scale.maxColor})`,
        }}
      />

      <div className="space-y-1">
        <Label className="text-xs">Max Color</Label>
        <Input
          type="color"
          className="w-[48px] h-9 p-1 cursor-pointer"
          value={scale.maxColor}
          onChange={(e) => onChange({ ...scale, maxColor: e.target.value })}
        />
      </div>

      <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={onRemove} aria-label="Remove color scale">
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}

function ConditionalFormatPanel({
  columns,
  rules,
  colorScales,
  onRulesChange,
  onColorScalesChange,
}: ConditionalFormatPanelProps) {
  function addRule() {
    const newRule: CellFormatRule = {
      id: generateId(),
      column: columns[0] ?? "",
      operator: ">=",
      value: 0,
      style: { backgroundColor: "#22c55e" },
    };
    onRulesChange([...rules, newRule]);
  }

  function updateRule(index: number, updated: CellFormatRule) {
    const next = [...rules];
    next[index] = updated;
    onRulesChange(next);
  }

  function removeRule(index: number) {
    onRulesChange(rules.filter((_, i) => i !== index));
  }

  function addColorScale() {
    const newScale: ColorScaleConfig = {
      column: columns[0] ?? "",
      minColor: "#ef4444",
      maxColor: "#22c55e",
    };
    onColorScalesChange([...colorScales, newScale]);
  }

  function updateColorScale(index: number, updated: ColorScaleConfig) {
    const next = [...colorScales];
    next[index] = updated;
    onColorScalesChange(next);
  }

  function removeColorScale(index: number) {
    onColorScalesChange(colorScales.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <h4 className="text-xs font-medium uppercase text-muted-foreground tracking-wider">
          Conditional Rules
        </h4>
        {rules.length === 0 && (
          <p className="text-sm text-muted-foreground">No rules configured.</p>
        )}
        {rules.map((rule, i) => (
          <RuleRow
            key={rule.id}
            rule={rule}
            columns={columns}
            onChange={(updated) => updateRule(i, updated)}
            onRemove={() => removeRule(i)}
          />
        ))}
        <Button variant="outline" size="sm" className="gap-1" onClick={addRule}>
          <Plus className="h-3 w-3" />
          Add Rule
        </Button>
      </div>

      <div className="space-y-3 border-t pt-4">
        <h4 className="text-xs font-medium uppercase text-muted-foreground tracking-wider">
          Color Scales
        </h4>
        {colorScales.map((scale, i) => (
          <ColorScaleRow
            key={`${scale.column}-${i}`}
            scale={scale}
            columns={columns}
            onChange={(updated) => updateColorScale(i, updated)}
            onRemove={() => removeColorScale(i)}
          />
        ))}
        <Button variant="outline" size="sm" className="gap-1" onClick={addColorScale}>
          <Plus className="h-3 w-3" />
          Add Color Scale
        </Button>
      </div>
    </div>
  );
}

export { ConditionalFormatPanel };
