import * as React from "react";
import { getChartOptions } from "./chart-options-schema";
import type { ChartOptionDef } from "./chart-options-schema";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { MultiSelect } from "./multi-select";

export interface ChartOptionsPanelProps {
  chartType: string;
  settings: Record<string, unknown>;
  onSettingsChange: (settings: Record<string, unknown>) => void;
  className?: string;
  /** Available column names from query results — used for column-multi-select fields. */
  columns?: string[];
  /** Categories to leave out, for a state where they do not apply (#2368). */
  hiddenCategories?: string[];
  /** Categories that start open besides the first (#2368). */
  openCategories?: string[];
}

/**
 * A radiogroup of named colour chips (#2368). Roving tabindex: the checked chip
 * is the one tab stop, arrows move and select, like a native radio group.
 */
function SwatchGroup({
  option,
  value,
  onChange,
}: Readonly<{
  option: ChartOptionDef;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
}>) {
  const items = option.options ?? [];
  // A stored value that is not a preset reads as the default, like the filter does.
  const current = items.some((i) => i.value === value) ? value : option.default;
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const labelId = `${option.key}-label`;
  function onKeyDown(e: React.KeyboardEvent, index: number) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[
      e.key
    ];
    if (!step) return;
    e.preventDefault();
    const next = (index + step + items.length) % items.length;
    onChange(option.key, items[next].value);
    refs.current[next]?.focus();
  }
  return (
    <div className="space-y-1.5">
      <span id={labelId} className="text-sm font-medium leading-none">
        {option.label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="flex flex-wrap gap-1.5"
      >
        {items.map((item, i) => {
          const checked = item.value === current;
          return (
            <button
              key={item.value}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={item.label}
              title={item.label}
              tabIndex={checked ? 0 : -1}
              onClick={() => onChange(option.key, item.value)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                "flex items-center gap-1.5 rounded-sm border px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                checked
                  ? "border-ring bg-accent text-accent-foreground"
                  : "border-input text-muted-foreground hover:text-foreground",
              )}
            >
              <span
                aria-hidden="true"
                className="h-3.5 w-3.5 rounded-sm border border-input"
                style={{ background: `hsl(var(${item.token}))` }}
              />
              {item.label}
              {/* Fixed slot, so the chip does not resize when the selection moves. */}
              {checked ? (
                <Check aria-hidden="true" className="h-3 w-3" />
              ) : (
                <span aria-hidden="true" className="h-3 w-3" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
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

// No Field here carries "(optional)": the chart-options panel is exempt (owner, #2217, 2026-10-19).
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
            stateLabel
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

    case "swatch":
      return <SwatchGroup option={option} value={value} onChange={onChange} />;

    case "select":
      return (
        <Field id={option.key} label={option.label} help={option.description}>
          <Select
            value={String(value ?? option.default)}
            onValueChange={(v) => onChange(option.key, v)}
          >
            <SelectTrigger>
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
        </Field>
      );

    case "column-multi-select": {
      // Fall back to text input when columns are not yet available (no preview query)
      if (!columns?.length) {
        return (
          <Field id={option.key} label={option.label} help={option.description}>
            <Input
              value={String(value ?? option.default ?? "")}
              onChange={(e) => onChange(option.key, e.target.value)}
              placeholder="Run a preview query to select columns"
            />
          </Field>
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
        <Field id={option.key} label={option.label} help={option.description}>
          <MultiSelect
            options={multiOptions}
            value={selected}
            onChange={(vals) => onChange(option.key, vals.join(","))}
            placeholder="Select columns…"
            className="w-full"
          />
        </Field>
      );
    }

    case "textarea":
      // Multiline string options (e.g. markdown content) — a single-line
      // Input strips newlines (#1049).
      return (
        <Field id={option.key} label={option.label} help={option.description}>
          <Textarea
            value={String(value ?? option.default ?? "")}
            onChange={(e) => onChange(option.key, e.target.value)}
            placeholder={option.label}
            rows={8}
            className="font-mono text-xs"
          />
        </Field>
      );

    case "text": {
      const textValue = String(value ?? option.default ?? "");
      const validation = option.validate?.(textValue) ?? null;
      const isError = validation?.level === "error";
      // A warning does not make the field invalid: it joins the help text,
      // which the control's aria-describedby already points at (#1283 2b).
      const help = validation && !isError && (
        <>
          {option.description}
          <span className="block text-[hsl(var(--warning))]">
            {validation.message}
          </span>
        </>
      );
      return (
        <Field
          id={option.key}
          label={option.label}
          help={help || option.description}
          error={isError ? validation.message : undefined}
        >
          <Input
            value={textValue}
            onChange={(e) => onChange(option.key, e.target.value)}
            placeholder={option.label}
          />
        </Field>
      );
    }

    case "number": {
      const current = value ?? option.default;
      let shown = option.placeholder ? "" : "0";
      if (typeof current === "number" || typeof current === "string")
        shown = String(current);
      return (
        <Field id={option.key} label={option.label} help={option.description}>
          <Input
            type="number"
            value={shown}
            placeholder={option.placeholder}
            onChange={(e) => {
              // Number("") is 0 — clearing the field would silently
              // commit 0 rather than leaving the option alone (#1292).
              // An option with a placeholder is "auto" when empty, so
              // clearing it unsets it instead (#2356).
              if (e.target.value === "") {
                if (option.placeholder) onChange(option.key, undefined);
                return;
              }
              onChange(option.key, Number(e.target.value));
            }}
          />
        </Field>
      );
    }

    default:
      return null;
  }
}

function CategorySection({
  title,
  defaultOpen = false,
  forceOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  /** Searching shows every match, so a hit is never hidden behind a heading. */
  forceOpen?: boolean;
  children: React.ReactNode;
}) {
  const [openState, setOpen] = React.useState(defaultOpen);
  const open = openState || forceOpen;
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
  hiddenCategories,
  openCategories,
}: ChartOptionsPanelProps) {
  const [search, setSearch] = React.useState("");
  const allOptions = getChartOptions(chartType);
  const options = React.useMemo(
    () => allOptions.filter((o) => !hiddenCategories?.includes(o.category)),
    [allOptions, hiddenCategories],
  );

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
    const next = { ...settings, [key]: value };
    if (value === undefined) delete next[key];
    onSettingsChange(next);
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
            defaultOpen={index === 0 || !!openCategories?.includes(category)}
            forceOpen={search.trim() !== ""}
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
