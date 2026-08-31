import * as React from "react";
import { getChartOptions } from "./chart-options-schema";
import type { ChartOptionDef } from "./chart-options-schema";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { MultiSelect } from "./multi-select";

export interface ChartOptionsPanelProps {
  chartType: string;
  settings: Record<string, unknown>;
  onSettingsChange: (settings: Record<string, unknown>) => void;
  className?: string;
  /** Available column names from query results — used for column-multi-select fields. */
  columns?: string[];
}

function OptionLabel({ option }: { option: ChartOptionDef }) {
  // #1283 item 2b: the description used to live only in a tooltip on this
  // Label. A Label is not focusable, so the tooltip's focus handlers could
  // never fire — and the dotted underline advertised content the keyboard
  // could not open. Render it as real text and let the control point at it
  // with aria-describedby.
  //
  // #1549: this returned a bare Fragment, and the boolean case renders it
  // straight inside `flex items-center justify-between`. The fragment
  // flattened, so the description became a third flex child between the label
  // and the Switch rather than sitting under the label. Both branches wrap so
  // described and undescribed rows nest identically and do not jump when a
  // description is added.
  return (
    <div className="min-w-0 space-y-0.5">
      <Label htmlFor={option.key} className="text-sm">
        {option.label}
      </Label>
      {option.description && (
        <p id={`${option.key}-desc`} className="text-xs text-muted-foreground">
          {option.description}
        </p>
      )}
    </div>
  );
}

function OptionField({
  option,
  value,
  onChange,
  columns,
}: {
  option: ChartOptionDef;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  columns?: string[];
}) {
  switch (option.type) {
    case "boolean":
      return (
        <div className="flex items-center justify-between gap-4">
          <OptionLabel option={option} />
          <Switch
            className="shrink-0"
            id={option.key}
            aria-describedby={
              option.description ? `${option.key}-desc` : undefined
            }
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
            <SelectTrigger
              id={option.key}
              aria-describedby={
                option.description ? `${option.key}-desc` : undefined
              }
            >
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

    case "column-multi-select": {
      // Fall back to text input when columns are not yet available (no preview query)
      if (!columns?.length) {
        return (
          <div className="space-y-1.5">
            <OptionLabel option={option} />
            <Input
              id={option.key}
              aria-describedby={
                option.description ? `${option.key}-desc` : undefined
              }
              value={String(value ?? option.default ?? "")}
              onChange={(e) => onChange(option.key, e.target.value)}
              placeholder="Run a preview query to select columns"
            />
          </div>
        );
      }
      const csv = String(value ?? option.default ?? "");
      const selected = csv
        ? csv
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
      const multiOptions = columns.map((col) => ({ value: col, label: col }));
      return (
        <div className="space-y-1.5">
          <OptionLabel option={option} />
          <MultiSelect
            options={multiOptions}
            value={selected}
            onChange={(vals) => onChange(option.key, vals.join(","))}
            placeholder="Select columns…"
            className="w-full"
          />
        </div>
      );
    }

    case "textarea":
      // Multiline string options (e.g. markdown content) — a single-line
      // Input strips newlines (#1049).
      return (
        <div className="space-y-1.5">
          <OptionLabel option={option} />
          <Textarea
            id={option.key}
            aria-describedby={
              option.description ? `${option.key}-desc` : undefined
            }
            value={String(value ?? option.default ?? "")}
            onChange={(e) => onChange(option.key, e.target.value)}
            placeholder={option.label}
            rows={8}
            className="font-mono text-xs"
          />
        </div>
      );

    case "text": {
      const textValue = String(value ?? option.default ?? "");
      const validation = option.validate?.(textValue) ?? null;
      return (
        <div className="space-y-1.5">
          <OptionLabel option={option} />
          <Input
            id={option.key}
            // #1283 item 2b: aria-invalid had nothing to point at — the
            // validation message sat in an unreferenced <p>. Link both the
            // description and the message; the attribute takes an id list.
            aria-describedby={
              [
                option.description ? `${option.key}-desc` : null,
                validation ? `${option.key}-validation` : null,
              ]
                .filter(Boolean)
                .join(" ") || undefined
            }
            value={textValue}
            onChange={(e) => onChange(option.key, e.target.value)}
            placeholder={option.label}
            aria-invalid={validation?.level === "error" ? true : undefined}
          />
          {validation && (
            <p
              id={`${option.key}-validation`}
              role={validation.level === "error" ? "alert" : undefined}
              className={
                validation.level === "error"
                  ? "text-xs text-destructive"
                  : "text-xs text-[hsl(var(--warning))]"
              }
            >
              {validation.message}
            </p>
          )}
        </div>
      );
    }

    case "number":
      return (
        <div className="space-y-1.5">
          <OptionLabel option={option} />
          <Input
            id={option.key}
            aria-describedby={
              option.description ? `${option.key}-desc` : undefined
            }
            type="number"
            value={String(value ?? option.default ?? 0)}
            onChange={(e) => {
              // Number("") is 0 — clearing the field would silently
              // commit 0 rather than leaving the option alone (#1292).
              if (e.target.value === "") return;
              onChange(option.key, Number(e.target.value));
            }}
          />
        </div>
      );

    default:
      return null;
  }
}

function CategorySection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="space-y-3">
      <button
        type="button"
        className="flex w-full items-center gap-1 text-xs font-medium uppercase text-muted-foreground tracking-wider hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" />
        )}
        {title}
      </button>
      {open && children}
    </div>
  );
}

function ChartOptionsPanel({
  chartType,
  settings,
  onSettingsChange,
  className,
  columns,
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
        opt.key.toLowerCase().includes(term),
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
    <div className={cn("space-y-4", className)}>
      {options.length > 4 && (
        <Input
          placeholder="Search options..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}

      <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
        {Object.entries(grouped).map(([category, opts], index) => (
          <CategorySection
            key={category}
            title={category}
            defaultOpen={index === 0}
          >
            {opts.map((opt) => (
              <OptionField
                key={opt.key}
                option={opt}
                value={settings[opt.key]}
                onChange={handleChange}
                columns={columns}
              />
            ))}
          </CategorySection>
        ))}
      </div>
    </div>
  );
}

export { ChartOptionsPanel };
