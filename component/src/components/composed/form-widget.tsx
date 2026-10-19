import React from "react";
import { Input } from "../ui/input";
import { Field } from "../ui/field";
import { Button } from "../ui/button";
import { successTextColor } from "../../lib/design-tokens";

export interface FormFieldDef {
  name: string;
  label: string;
  type: "text" | "number" | "date";
}

export interface FormWidgetProps {
  fields: FormFieldDef[];
  values: Record<string, string>;
  onFieldChange: (name: string, value: string) => void;
  onSubmit: (values: Record<string, string>) => void;
  submitButtonText?: string;
  isSubmitting?: boolean;
  successMessage?: string | null;
  errorMessage?: string | null;
}

export function FormWidget({
  fields,
  values,
  onFieldChange,
  onSubmit,
  submitButtonText = "Submit",
  isSubmitting = false,
  successMessage,
  errorMessage,
}: FormWidgetProps) {
  if (fields.length === 0) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(values);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4">
      {fields.map((field) => (
        <Field
          key={field.name}
          id={`form-field-${field.name}`}
          label={field.label}
        >
          <Input
            type={field.type}
            value={values[field.name] ?? ""}
            onChange={(e) => onFieldChange(field.name, e.target.value)}
          />
        </Field>
      ))}

      {successMessage && (
        <p className={`text-sm ${successTextColor}`}>{successMessage}</p>
      )}
      {errorMessage && (
        <p className="text-sm text-destructive">{errorMessage}</p>
      )}

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? "Submitting..." : submitButtonText}
      </Button>
    </form>
  );
}
