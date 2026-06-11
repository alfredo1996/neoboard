import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingButton } from "./loading-button";
import { cn } from "@/lib/utils";

export interface ConnectionFieldConfig {
  name: string;
  label: string;
  type: "text" | "password" | "number" | "select";
  placeholder?: string;
  options?: string[];
  defaultValue?: string;
  required?: boolean;
  width?: string;
  /**
   * Per-field validator (#981). Return an error string to block submit/test,
   * or undefined when valid. Receives the field value and all current values.
   */
  validate?: (value: string, all: Record<string, string>) => string | undefined;
}

/** Built-in numeric port validator (1–65535). */
export function validatePort(value: string): string | undefined {
  if (!value.trim()) return undefined; // empty handled by `required`
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    return "Enter a valid port (1–65535)";
  }
  return undefined;
}

export interface ConnectionFormProps {
  fields: ConnectionFieldConfig[];
  defaultValues?: Record<string, string>;
  /** External (e.g. server-side) per-field errors to surface (#981). */
  errors?: Record<string, string>;
  onSubmit?: (values: Record<string, string>) => void;
  onTest?: (values: Record<string, string>) => void;
  testing?: boolean;
  submitting?: boolean;
  submitLabel?: string;
  testLabel?: string;
  className?: string;
}

export const neo4jConnectionFields: ConnectionFieldConfig[] = [
  {
    name: "protocol",
    label: "Protocol",
    type: "select",
    options: ["neo4j", "neo4j+s", "neo4j+ssc", "bolt", "bolt+s", "bolt+ssc"],
    defaultValue: "neo4j",
    width: "w-[140px]",
  },
  {
    name: "host",
    label: "Host",
    type: "text",
    placeholder: "localhost",
    defaultValue: "localhost",
  },
  {
    name: "port",
    label: "Port",
    type: "text",
    placeholder: "7687",
    defaultValue: "7687",
    width: "w-[80px]",
    validate: validatePort,
  },
  {
    name: "database",
    label: "Database",
    type: "text",
    placeholder: "neo4j (default)",
  },
  {
    name: "username",
    label: "Username",
    type: "text",
    placeholder: "neo4j",
  },
  {
    name: "password",
    label: "Password",
    type: "password",
    placeholder: "••••••••",
  },
];

export const postgresConnectionFields: ConnectionFieldConfig[] = [
  {
    name: "host",
    label: "Host",
    type: "text",
    placeholder: "localhost",
    defaultValue: "localhost",
  },
  {
    name: "port",
    label: "Port",
    type: "text",
    placeholder: "5432",
    defaultValue: "5432",
    width: "w-[80px]",
    validate: validatePort,
  },
  {
    name: "database",
    label: "Database",
    type: "text",
    placeholder: "mydb",
    required: true,
  },
  {
    name: "schema",
    label: "Schema",
    type: "text",
    placeholder: "public",
    defaultValue: "public",
    width: "w-[120px]",
  },
  {
    name: "username",
    label: "Username",
    type: "text",
    placeholder: "postgres",
  },
  {
    name: "password",
    label: "Password",
    type: "password",
    placeholder: "••••••••",
  },
  {
    name: "sslmode",
    label: "SSL Mode",
    type: "select",
    options: ["prefer", "require", "verify-ca", "verify-full", "disable"],
    // 'prefer' (#981): negotiate TLS when the server supports it, fall back
    // to plaintext only if it doesn't — a safer default than 'disable'.
    defaultValue: "prefer",
    width: "w-[140px]",
  },
];

function ConnectionForm({
  fields,
  defaultValues,
  errors,
  onSubmit,
  onTest,
  testing = false,
  submitting = false,
  submitLabel = "Connect",
  testLabel = "Test Connection",
  className,
}: ConnectionFormProps) {
  const [values, setValues] = React.useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of fields) {
      initial[field.name] =
        defaultValues?.[field.name] ?? field.defaultValue ?? "";
    }
    return initial;
  });

  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>(
    {},
  );

  const update = (name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    // Clear an internal error as soon as the user edits the field.
    setFieldErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  /** Run all field validators; returns the error map (empty = valid). */
  const validateAll = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    for (const field of fields) {
      const value = values[field.name] ?? "";
      if (field.required && !value.trim()) {
        errs[field.name] = `${field.label} is required`;
        continue;
      }
      // Built-in numeric validation for any field named "port" unless the
      // config supplies its own validator (#981).
      const validator =
        field.validate ?? (field.name === "port" ? validatePort : undefined);
      const err = validator?.(value, values);
      if (err) errs[field.name] = err;
    }
    return errs;
  };

  const guard = (action: (v: Record<string, string>) => void) => () => {
    const errs = validateAll();
    setFieldErrors(errs);
    if (Object.keys(errs).length === 0) action(values);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    guard((v) => onSubmit?.(v))();
  };

  // External errors (server-side) merge with internal validation errors;
  // internal takes precedence since it reflects the latest edit.
  const displayError = (name: string): string | undefined =>
    fieldErrors[name] ?? errors?.[name];

  return (
    <form onSubmit={handleSubmit} className={cn("space-y-4", className)}>
      <div className="flex flex-wrap gap-2">
        {fields.map((field) => (
          <div
            key={field.name}
            className={cn(
              "space-y-1.5",
              field.width ? field.width : "flex-1 min-w-[120px]",
            )}
          >
            <Label htmlFor={field.name} className="text-xs">
              {field.label}
              {field.required && (
                <span className="text-destructive ml-0.5">*</span>
              )}
            </Label>
            {field.type === "select" ? (
              <Select
                value={values[field.name]}
                onValueChange={(v) => update(field.name, v)}
              >
                <SelectTrigger id={field.name}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {field.options?.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id={field.name}
                type={field.type}
                inputMode={field.name === "port" ? "numeric" : undefined}
                value={values[field.name]}
                onChange={(e) => update(field.name, e.target.value)}
                placeholder={field.placeholder}
                required={field.required}
                aria-invalid={displayError(field.name) ? true : undefined}
                aria-describedby={
                  displayError(field.name) ? `${field.name}-error` : undefined
                }
              />
            )}
            {displayError(field.name) && (
              <p
                id={`${field.name}-error`}
                className="text-xs text-destructive"
              >
                {displayError(field.name)}
              </p>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2 pt-2">
        {onTest && (
          <LoadingButton
            type="button"
            variant="outline"
            loading={testing}
            loadingText="Testing..."
            onClick={guard((v) => onTest(v))}
          >
            {testLabel}
          </LoadingButton>
        )}
        <LoadingButton
          type="submit"
          loading={submitting}
          loadingText="Connecting..."
          className="ml-auto"
        >
          {submitLabel}
        </LoadingButton>
      </div>
    </form>
  );
}

export { ConnectionForm };
