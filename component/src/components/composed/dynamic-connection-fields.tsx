import type { ChangeEvent } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
 * One field in a connector's connection form. Mirrors the
 * `ConnectorFormField` contract from @neoboard/connector-sdk, with `name`
 * as the value key (the SDK calls it `key`). Callers map `key` → `name`.
 */
export interface DynamicConnectionField {
  name: string;
  label: string;
  type: "text" | "password" | "number" | "select" | "boolean";
  required?: boolean;
  placeholder?: string;
  description?: string;
  options?: { label: string; value: string }[];
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
 * Renders a connection form's fields from a connector's `formFields`
 * definition (#1118). Controlled — the parent owns the values and gets
 * `(name, value)` change callbacks. The credential block of the connections
 * page and the library `ConnectionForm` both render through this.
 */
type ChangeHandler = (name: string, value: string | boolean) => void;

/** Field label with a required-asterisk. */
function FieldLabel({
  field,
  id,
}: Readonly<{ field: DynamicConnectionField; id: string }>) {
  return (
    <Label htmlFor={id} className="text-xs">
      {field.label}
      {field.required && <span className="text-destructive ml-0.5">*</span>}
    </Label>
  );
}

/** The input control for a non-boolean field (select / password / text). */
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
  return (
    <Input type={field.type === "number" ? "number" : "text"} {...shared} />
  );
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
  const id = `${idPrefix}${field.name}`;
  const errorId = `${id}-error`;
  const strValue = String(values[field.name] ?? "");

  return (
    <div className="space-y-1.5">
      {field.type === "boolean" ? (
        <div className="flex items-center gap-2">
          <input
            id={id}
            type="checkbox"
            className="h-4 w-4 rounded border-input"
            checked={Boolean(values[field.name])}
            onChange={(e) => onChange(field.name, e.target.checked)}
          />
          <FieldLabel field={field} id={id} />
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
      {error && (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      )}
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
