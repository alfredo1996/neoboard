import type { ChangeEvent } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field-error";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PasswordInput } from "./password-input";
import { cn } from "@/lib/utils";

/**
 * One field in a connector's connection form. Mirrors a connector
 * descriptor's field (`ConnectorField` in @neoboard/connector-sdk), with
 * `name` as the value key (the SDK calls it `key`). Callers map `key` → `name`.
 */
export interface DynamicConnectionField {
  name: string;
  /** Input id suffix after `idPrefix`; defaults to `name`. */
  id?: string;
  label: string;
  type: "text" | "password" | "number" | "select" | "boolean";
  required?: boolean;
  placeholder?: string;
  description?: string;
  options?: { label: string; value: string }[];
  /** `number` only — inclusive bounds, put on the input. */
  min?: number;
  max?: number;
  /** `number` only — shown after the label, e.g. "ms". */
  unit?: string;
}

export interface DynamicConnectionFieldsProps {
  fields: DynamicConnectionField[];
  values: Record<string, string | boolean | undefined>;
  onChange: (name: string, value: string | boolean) => void;
  /** Per-field error messages, keyed by field name. */
  errors?: Record<string, string>;
  /** Prefix for input ids (default "conn-" preserves existing E2E selectors). */
  idPrefix?: string;
  className?: string;
}

/**
 * Renders a connection form's fields from the field list it is handed (#1118,
 * #1901). Controlled — the parent owns the values and gets `(name, value)`
 * change callbacks. Purely presentational: which fields exist, how they are
 * grouped and what is valid are the caller's business.
 */
type ChangeHandler = (name: string, value: string | boolean) => void;

/** Field label with its unit and a required-asterisk. */
function FieldLabel({
  field,
  id,
}: Readonly<{ field: DynamicConnectionField; id: string }>) {
  return (
    <Label htmlFor={id} className="text-xs">
      {field.label}
      {field.unit && (
        <span className="text-muted-foreground"> ({field.unit})</span>
      )}
      {field.required && <span className="text-destructive ml-0.5">*</span>}
    </Label>
  );
}

/** The input control for a non-boolean field (select / password / number / text). */
function FieldControl({
  field,
  id,
  errorId,
  value,
  error,
  onChange,
}: Readonly<{
  field: DynamicConnectionField;
  id: string;
  errorId: string;
  value: string;
  error?: string;
  onChange: ChangeHandler;
}>) {
  if (field.type === "select") {
    return (
      <Select value={value} onValueChange={(v) => onChange(field.name, v)}>
        <SelectTrigger id={id} aria-label={field.label}>
          <SelectValue placeholder={field.placeholder} />
        </SelectTrigger>
        <SelectContent>
          {field.options?.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  const shared = {
    id,
    value,
    onChange: (e: ChangeEvent<HTMLInputElement>) =>
      onChange(field.name, e.target.value),
    placeholder: field.placeholder,
    required: field.required,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? errorId : undefined,
  };

  if (field.type === "password") {
    return <PasswordInput {...shared} />;
  }
  if (field.type === "number") {
    // Whole numbers within the field's bounds; an absent bound leaves no attribute.
    return (
      <Input
        type="number"
        step={1}
        min={field.min}
        max={field.max}
        {...shared}
      />
    );
  }
  return <Input type="text" {...shared} />;
}

/** One labelled field row with optional description + error. */
function FieldRow({
  field,
  idPrefix,
  values,
  error,
  onChange,
}: Readonly<{
  field: DynamicConnectionField;
  idPrefix: string;
  values: Record<string, string | boolean | undefined>;
  error?: string;
  onChange: ChangeHandler;
}>) {
  const id = `${idPrefix}${field.id ?? field.name}`;
  const errorId = `${id}-error`;
  const strValue = String(values[field.name] ?? "");

  return (
    <div className="space-y-1.5">
      {field.type === "boolean" ? (
        <div className="flex items-center justify-between gap-2">
          <FieldLabel field={field} id={id} />
          <Switch
            id={id}
            checked={Boolean(values[field.name])}
            onCheckedChange={(checked) => onChange(field.name, checked)}
          />
        </div>
      ) : (
        <>
          <FieldLabel field={field} id={id} />
          <FieldControl
            field={field}
            id={id}
            errorId={errorId}
            value={strValue}
            error={error}
            onChange={onChange}
          />
        </>
      )}
      {field.description && (
        <p className="text-xs text-muted-foreground">{field.description}</p>
      )}
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}

function DynamicConnectionFields({
  fields,
  values,
  onChange,
  errors,
  idPrefix = "conn-",
  className,
}: Readonly<DynamicConnectionFieldsProps>) {
  return (
    <div className={cn("space-y-4", className)}>
      {fields.map((field) => (
        <FieldRow
          key={field.name}
          field={field}
          idPrefix={idPrefix}
          values={values}
          error={errors?.[field.name]}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

export { DynamicConnectionFields };
