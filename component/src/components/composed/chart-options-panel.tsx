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
import type { SettingsGroup } from "./chart-settings-panel";

export interface ChartOptionGroupsProps {
  chartType: string;
  settings: Record<string, unknown>;
  onSettingsChange: (settings: Record<string, unknown>) => void;
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
              className={cn(
                "h-3.5 w-3.5 rounded-sm border border-input",
                // No colour to show: None is an empty, dashed chip.
                !item.token && "border-dashed",
              )}
              style={
                item.token
                  ? { background: `hsl(var(${item.token}))` }
                  : undefined
              }
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

/**
 * "Show Grid Lines" reads "Show grid lines" in the editor, and a trailing
 * "(JSON)" or "(px)" is the control's business, not the label's. Acronyms and
 * single letters ("URL", "X", "N") keep their case.
 */
function labelOf(label: string) {
  const open = label.indexOf("(");
  const close = label.indexOf(")", open);
  const bare =
    open >= 0 && close > open
      ? label.slice(0, open).trimEnd() + label.slice(close + 1)
      : label;
  return bare.replaceAll(/(?<=\s)[A-Z][a-z]+/g, (word) => word.toLowerCase());
}

/** An option value as field text: strings and numbers show, anything else is empty. */
function asText(v: unknown) {
  return typeof v === "string" || typeof v === "number" ? String(v) : "";
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
    ? asText(value).replace("%", "")
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
    if (text === "") {
      // No automatic value and no placeholder: the field has nothing to fall
      // back to, so an emptied one leaves the option alone (#1292).
      if (option.auto !== undefined || option.placeholder !== undefined)
        onChange(option.key, option.auto);
      return;
    }
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

interface ControlProps {
  readonly option: ChartOptionDef;
  readonly value: unknown;
  readonly set: (value: unknown) => void;
  readonly id: string;
  readonly labelId: string;
  readonly describedBy?: string;
}

function SelectControl({
  option,
  value,
  set,
  id,
  labelId,
  describedBy,
}: ControlProps) {
  const current = asText(value ?? option.default);
  if ((option.options?.length ?? 0) <= 3) {
    return (
      <SegmentedControl
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        value={current}
        onValueChange={set}
        options={(option.options ?? []).map((o) => ({
          value: o.value,
          label: o.label,
        }))}
      />
    );
  }
  return (
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
    </Select>
  );
}

function ColumnsControl({
  option,
  value,
  set,
  id,
  labelId,
  describedBy,
  columns,
}: ControlProps & { readonly columns?: string[] }) {
  const csv = asText(value ?? option.default);
  // Fall back to text input when columns are not yet available (no preview query)
  if (!columns?.length) {
    return (
      <Input
        id={id}
        value={csv}
        onChange={(e) => set(e.target.value)}
        aria-describedby={describedBy}
        placeholder="Run a preview query to select columns"
      />
    );
  }
  const selected = csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return (
    <MultiSelect
      aria-labelledby={labelId}
      options={columns.map((col) => ({ value: col, label: col }))}
      value={selected}
      onChange={(vals) => set(vals.join(","))}
      placeholder="Select columns…"
      className="w-full"
    />
  );
}

function TextControl({
  option,
  value,
  set,
  id,
  describedBy,
}: Omit<ControlProps, "labelId">) {
  const textValue = asText(value ?? option.default);
  const validation = option.validate?.(textValue) ?? null;
  const isError = validation?.level === "error";
  const messageId = `${id}-help`;
  const described =
    [describedBy, validation ? messageId : undefined]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <>
      {option.multiline ? (
        <Textarea
          id={id}
          rows={option.maxLength ? 3 : 2}
          className={option.maxLength ? "text-sm" : "font-mono text-xs"}
          maxLength={option.maxLength}
          placeholder={option.placeholder}
          value={textValue}
          onChange={(e) => set(e.target.value)}
          aria-describedby={described}
        />
      ) : (
        <Input
          id={id}
          value={textValue}
          onChange={(e) => set(e.target.value)}
          placeholder="None"
          aria-invalid={isError || undefined}
          aria-describedby={described}
        />
      )}
      {option.maxLength && (
        <p className="justify-self-end text-meta tabular-nums text-muted-foreground">
          {textValue.length} / {option.maxLength}
        </p>
      )}
      {validation && isError && (
        <FieldError id={messageId}>{validation.message}</FieldError>
      )}
      {/* A warning does not make the field invalid: it joins the help. */}
      {validation && !isError && (
        <p id={messageId} className="text-meta text-[hsl(var(--warning))]">
          {validation.message}
        </p>
      )}
    </>
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
  const set = (v: unknown) => onChange(option.key, v);
  const control: ControlProps = {
    option,
    value,
    set,
    id,
    labelId,
    describedBy: option.description ? descId : undefined,
  };

  if (option.type === "textarea") {
    // Multiline string options (e.g. markdown content) — a single-line
    // Input strips newlines (#1049). The label stacks above it.
    return (
      <Field id={id} label={label} help={option.help ?? option.description}>
        <Textarea
          value={asText(value ?? option.default)}
          onChange={(e) => set(e.target.value)}
          placeholder={option.label}
          rows={16}
          className="font-mono text-xs"
        />
      </Field>
    );
  }

  let body: React.ReactNode = null;
  if (option.type === "boolean") {
    body = (
      <Switch
        stateLabel
        id={id}
        aria-describedby={control.describedBy}
        checked={Boolean(value ?? option.default)}
        onCheckedChange={set}
      />
    );
  } else if (option.type === "swatch") {
    body = (
      <SwatchGroup
        option={option}
        value={value}
        onChange={onChange}
        labelId={labelId}
      />
    );
  } else if (option.type === "select") {
    body = <SelectControl {...control} />;
  } else if (option.type === "column-multi-select") {
    body = <ColumnsControl {...control} columns={columns} />;
  } else if (option.type === "number" || option.percent) {
    body = (
      <NumberControl
        option={option}
        value={value ?? (option.percent ? option.default : undefined)}
        onChange={onChange}
        id={id}
        describedBy={control.describedBy}
      />
    );
  } else if (option.type === "text") {
    body = <TextControl {...control} />;
  }
  if (body === null) return null;

  return (
    <SettingRow
      label={label}
      htmlFor={id}
      labelId={labelId}
      help={option.help}
      // A segmented control has a width of its own: it drops under its label
      // when it does not fit. A lone switch sits level with the label.
      wraps={option.type === "select" && (option.options?.length ?? 0) <= 3}
      compact={option.type === "boolean"}
    >
      {body}
      {option.description && (
        <span id={descId} className="sr-only">
          {option.description}
        </span>
      )}
    </SettingRow>
  );
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
}: ChartOptionGroupsProps): SettingsGroup[] {
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

/** The Card group's rows (#2394): what the editor stores beside the title, not in chartOptions. */
const CARD_OPTIONS: ChartOptionDef[] = [
  {
    key: "cardBackground",
    label: "Background",
    type: "swatch",
    default: "default",
    category: "Card",
    options: [
      { value: "default", label: "Default", token: "--card-plain" },
      { value: "none", label: "None" },
      { value: "azure", label: "Azure", token: "--param-fill-azure" },
      { value: "citrine", label: "Citrine", token: "--card-fill-citrine" },
      { value: "sage", label: "Sage", token: "--param-fill-sage" },
      { value: "rose", label: "Rose", token: "--card-fill-rose" },
    ],
  },
  {
    key: "description",
    label: "Description",
    type: "text",
    default: "",
    category: "Card",
    multiline: true,
    maxLength: 200,
    placeholder: "What this card shows",
    help: "Shown as an info icon after the title. Filter parameters work here, as in the title.",
  },
];

/**
 * The Card group (#2394), first in Style. The editor draws it itself, as it
 * does Caching, because its values live on the widget's settings and not in a
 * chart's options. A chart has no Background row (`canTint` false).
 */
function cardOptionGroup({
  canTint,
  settings,
  onChange,
}: Readonly<{
  canTint: boolean;
  settings: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}>): SettingsGroup {
  return {
    name: "Card",
    render: (search: string) => {
      const term = search.toLowerCase();
      const rows = CARD_OPTIONS.filter(
        (o) => (canTint || o.key !== "cardBackground") && matches(o, term),
      );
      if (rows.length === 0) return null;
      return rows.map((opt) => (
        <OptionRow
          key={opt.key}
          option={opt}
          value={settings[opt.key]}
          onChange={onChange}
        />
      ));
    },
  };
}

export { chartOptionGroups, cardOptionGroup };
