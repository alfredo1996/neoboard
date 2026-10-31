import * as React from "react";
import { getChartOptions } from "./chart-options-schema";
import type { ChartOptionDef, OptionGroup } from "./chart-options-schema";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { FieldError } from "@/components/ui/field-error";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { MultiSelect } from "./multi-select";
import { SettingRow } from "./setting-row";
import { SettingsGroupBlock, renderSection } from "./chart-settings-panel";
import type { SettingsGroup } from "./chart-settings-panel";

export interface ChartOptionsPanelProps {
  chartType: string;
  settings: Record<string, unknown>;
  onSettingsChange: (settings: Record<string, unknown>) => void;
  className?: string;
  /** Available column names from query results — used for column-multi-select fields. */
  columns?: string[];
  /** Groups to leave out, for a state where they do not apply (#2368). */
  hiddenCategories?: readonly OptionGroup[];
}

/**
 * A radiogroup of named colour chips (#2368). Roving tabindex: the checked chip
 * is the one tab stop, arrows move and select, like a native radio group.
 */
function SwatchGroup({
  option,
  value,
  onChange,
  labelId,
}: Readonly<{
  option: ChartOptionDef;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  labelId: string;
}>) {
  const items = option.options ?? [];
  // A stored value that is not a preset reads as the default, like the filter does.
  const current = items.some((i) => i.value === value) ? value : option.default;
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
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
  );
}

/** A trailing "(JSON)" or "(px)" in a label is the control's business, not the label's. */
function labelOf(label: string) {
  return label.replace(/\s*\([^)]*\)/, "");
}

function NumberControl({
  option,
  value,
  onChange,
  id,
  describedBy,
}: Readonly<{
  option: ChartOptionDef;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  id: string;
  describedBy?: string;
}>) {
  const raw = option.percent
    ? String(value ?? "").replace("%", "")
    : (value ?? option.default);
  // A stored `auto` value (0 or -1) and an unset one both read as empty.
  let shown = "";
  if (
    raw !== option.auto &&
    (typeof raw === "number" || typeof raw === "string")
  )
    shown = String(raw);
  const fallback = option.auto === undefined ? option.placeholder : "Auto";
  function write(text: string) {
    if (option.percent)
      return onChange(option.key, text === "" ? "" : `${text}%`);
    // Number("") is 0, so an emptied field is not a typed 0 (#1292): it stores
    // the option's automatic value, or unsets an option that has no stored one
    // (#2356).
    if (text === "") return onChange(option.key, option.auto);
    onChange(option.key, Number(text));
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-caption text-muted-foreground">
      <Input
        id={id}
        type="number"
        className="w-[84px]"
        value={shown}
        placeholder={fallback}
        aria-describedby={describedBy}
        onChange={(e) => write(e.target.value)}
      />
      {option.unit}
    </span>
  );
}

// No Field here carries "(optional)": the chart-options panel is exempt (owner, #2217, 2026-10-19).
function OptionRow({
  option,
  value,
  onChange,
  columns,
}: Readonly<{
  option: ChartOptionDef;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  columns?: string[];
}>) {
  const id = option.key;
  const labelId = `${id}-label`;
  const descId = `${id}-desc`;
  const label = labelOf(option.label);
  // The long description is read, not shown; `help` is the line that adds a rule.
  const description = option.description && (
    <span id={descId} className="sr-only">
      {option.description}
    </span>
  );
  const describedBy = option.description ? descId : undefined;
  const set = (v: unknown) => onChange(option.key, v);
  const row = (
    control: React.ReactNode,
    props?: { wraps?: boolean; compact?: boolean },
  ) => (
    <SettingRow
      label={label}
      htmlFor={id}
      labelId={labelId}
      help={option.help}
      {...props}
    >
      {control}
      {description}
    </SettingRow>
  );

  switch (option.type) {
    case "boolean":
      return row(
        <Switch
          stateLabel
          id={id}
          aria-describedby={describedBy}
          checked={Boolean(value ?? option.default)}
          onCheckedChange={set}
        />,
        { compact: true },
      );

    case "swatch":
      return row(
        <SwatchGroup
          option={option}
          value={value}
          onChange={onChange}
          labelId={labelId}
        />,
      );

    case "select": {
      const current = String(value ?? option.default);
      if ((option.options?.length ?? 0) <= 3) {
        return row(
          <SegmentedControl
            aria-labelledby={labelId}
            aria-describedby={describedBy}
            value={current}
            onValueChange={set}
            options={(option.options ?? []).map((o) => ({
              value: o.value,
              label: o.label,
            }))}
          />,
          { wraps: true },
        );
      }
      return row(
        <Select value={current} onValueChange={set}>
          <SelectTrigger
            id={id}
            aria-labelledby={labelId}
            aria-describedby={describedBy}
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
        </Select>,
      );
    }

    case "column-multi-select": {
      // Fall back to text input when columns are not yet available (no preview query)
      if (!columns?.length) {
        return row(
          <Input
            id={id}
            value={String(value ?? option.default ?? "")}
            onChange={(e) => set(e.target.value)}
            aria-describedby={describedBy}
            placeholder="Run a preview query to select columns"
          />,
        );
      }
      const csv = String(value ?? option.default ?? "");
      const selected = csv
        ? csv
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
      return row(
        <MultiSelect
          options={columns.map((col) => ({ value: col, label: col }))}
          value={selected}
          onChange={(vals) => set(vals.join(","))}
          placeholder="Select columns…"
          className="w-full"
        />,
      );
    }

    case "textarea":
      // Multiline string options (e.g. markdown content) — a single-line
      // Input strips newlines (#1049). The label stacks above it.
      return (
        <Field id={id} label={label} help={option.help ?? option.description}>
          <Textarea
            value={String(value ?? option.default ?? "")}
            onChange={(e) => set(e.target.value)}
            placeholder={option.label}
            rows={16}
            className="font-mono text-xs"
          />
        </Field>
      );

    case "text": {
      const textValue = String(value ?? option.default ?? "");
      const validation = option.validate?.(textValue) ?? null;
      const isError = validation?.level === "error";
      const messageId = `${id}-help`;
      const control = option.multiline ? (
        <Textarea
          id={id}
          rows={2}
          className="font-mono text-xs"
          value={textValue}
          onChange={(e) => set(e.target.value)}
          aria-describedby={describedBy}
        />
      ) : (
        <Input
          id={id}
          value={textValue}
          onChange={(e) => set(e.target.value)}
          placeholder={option.percent ? undefined : "None"}
          aria-invalid={isError || undefined}
          aria-describedby={
            [describedBy, validation ? messageId : undefined]
              .filter(Boolean)
              .join(" ") || undefined
          }
        />
      );
      if (option.percent) {
        return row(
          <NumberControl
            option={option}
            value={value ?? option.default}
            onChange={onChange}
            id={id}
            describedBy={describedBy}
          />,
        );
      }
      return row(
        <>
          {control}
          {validation &&
            (isError ? (
              <FieldError id={messageId}>{validation.message}</FieldError>
            ) : (
              // A warning does not make the field invalid: it joins the help.
              <p
                id={messageId}
                className="text-meta text-[hsl(var(--warning))]"
              >
                {validation.message}
              </p>
            ))}
        </>,
      );
    }

    case "number":
      return row(
        <NumberControl
          option={option}
          value={value}
          onChange={onChange}
          id={id}
          describedBy={describedBy}
        />,
      );

    default:
      return null;
  }
}

function matches(option: ChartOptionDef, term: string) {
  return (
    term === "" ||
    option.label.toLowerCase().includes(term) ||
    option.category.toLowerCase().includes(term) ||
    option.key.toLowerCase().includes(term)
  );
}

/**
 * The rows of a chart's options as editor groups (#2388), one per `category`.
 * The panel puts them in the fixed order and in their section; a group with no
 * row left after the search renders null, so it has no heading.
 */
function chartOptionGroups({
  chartType,
  settings,
  onSettingsChange,
  columns,
  hiddenCategories,
}: Omit<ChartOptionsPanelProps, "className">): SettingsGroup[] {
  const options = getChartOptions(chartType).filter(
    (o) => !hiddenCategories?.includes(o.category),
  );
  function handleChange(key: string, value: unknown) {
    const next = { ...settings, [key]: value };
    if (value === undefined) delete next[key];
    onSettingsChange(next);
  }
  const names = [...new Set(options.map((o) => o.category))];
  return names.map((name) => ({
    name,
    render: (search: string) => {
      const term = search.toLowerCase();
      const rows = options.filter(
        (o) => o.category === name && matches(o, term),
      );
      if (rows.length === 0) return null;
      return rows.map((opt) => (
        <OptionRow
          key={opt.key}
          option={opt}
          value={settings[opt.key]}
          onChange={handleChange}
          columns={columns}
        />
      ));
    },
  }));
}

/** Every option of a chart type in the fixed group order, under group headings. */
function ChartOptionsPanel({
  className,
  ...props
}: Readonly<ChartOptionsPanelProps>) {
  const groups = chartOptionGroups(props);
  if (groups.length === 0) {
    return (
      <p className={cn("text-sm text-muted-foreground py-2", className)}>
        No configurable options for this chart type.
      </p>
    );
  }
  const sections = ["content", "data", "style", "behavior"] as const;
  return (
    <div className={className}>
      {sections.flatMap((section) =>
        renderSection(groups, section, "").map(([name, nodes]) => (
          <SettingsGroupBlock key={name} name={name}>
            {nodes}
          </SettingsGroupBlock>
        )),
      )}
    </div>
  );
}

export { ChartOptionsPanel, chartOptionGroups };
