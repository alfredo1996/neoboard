import * as React from "react";
import { getChartOptions } from "./chart-options-schema";
import type { ChartOptionDef } from "./chart-options-schema";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface ChartOptionsPanelProps {
  chartType: string;
  settings: Record<string, unknown>;
  onSettingsChange: (settings: Record<string, unknown>) => void;
  className?: string;
}

function OptionLabel({ option }: { option: ChartOptionDef }) {
  if (!option.description) {
    return (
      <Label htmlFor={option.key} className="text-sm">
        {option.label}
      </Label>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Label
          htmlFor={option.key}
          className="text-sm cursor-help underline decoration-dotted underline-offset-2"
        >
          {option.label}
        </Label>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        {option.description}
      </TooltipContent>
    </Tooltip>
  );
}

function OptionField({
  option,
  value,
  onChange,
}: {
  option: ChartOptionDef;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
}) {
  switch (option.type) {
    case "boolean":
      return (
        <div className="flex items-center justify-between">
          <OptionLabel option={option} />
          <Switch
            id={option.key}
            checked={Boolean(value ?? option.default)}
            onCheckedChange={(checked) => onChange(option.key, checked)}
          />
        </div>
      );

    case "select":
      return (
        <div className="space-y-1.5">
          <OptionLabel option={option} />
          <Select
            value={String(value ?? option.default)}
            onValueChange={(v) => onChange(option.key, v)}
          >
            <SelectTrigger id={option.key}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {option.options?.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );

    case "text":
      return (
        <div className="space-y-1.5">
          <OptionLabel option={option} />
          <Input
            id={option.key}
            value={String(value ?? option.default ?? "")}
            onChange={(e) => onChange(option.key, e.target.value)}
            placeholder={option.label}
          />
        </div>
      );

    case "number":
      return (
        <div className="space-y-1.5">
          <OptionLabel option={option} />
          <Input
            id={option.key}
            type="number"
            value={String(value ?? option.default ?? 0)}
            onChange={(e) => onChange(option.key, Number(e.target.value))}
          />
        </div>
      );

    default:
      return null;
  }
}

function ChartOptionsPanel({
  chartType,
  settings,
  onSettingsChange,
  className,
}: ChartOptionsPanelProps) {
  const [search, setSearch] = React.useState("");
  const options = getChartOptions(chartType);

  const filteredOptions = React.useMemo(() => {
    if (!search.trim()) return options;
    const term = search.toLowerCase();
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(term) ||
        opt.category.toLowerCase().includes(term) ||
        opt.key.toLowerCase().includes(term)
    );
  }, [options, search]);

  const grouped = React.useMemo(() => {
    const groups: Record<string, ChartOptionDef[]> = {};
    for (const opt of filteredOptions) {
      (groups[opt.category] ??= []).push(opt);
    }
    return groups;
  }, [filteredOptions]);

  function handleChange(key: string, value: unknown) {
    onSettingsChange({ ...settings, [key]: value });
  }

  if (options.length === 0) {
    return (
      <p className={cn("text-sm text-muted-foreground py-2", className)}>
        No configurable options for this chart type.
      </p>
    );
  }

  return (
    <TooltipProvider>
    <div className={cn("space-y-4", className)}>
      {options.length > 4 && (
        <Input
          placeholder="Search options..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}

      <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
        {Object.entries(grouped).map(([category, opts]) => (
          <div key={category} className="space-y-3">
            <h4 className="text-xs font-medium uppercase text-muted-foreground tracking-wider">
              {category}
            </h4>
            {opts.map((opt) => (
              <OptionField
                key={opt.key}
                option={opt}
                value={settings[opt.key]}
                onChange={handleChange}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
    </TooltipProvider>
  );
}

export { ChartOptionsPanel };
