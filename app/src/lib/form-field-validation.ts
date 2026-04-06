import type { FormFieldDef } from "./form-field-def";

/**
 * Regex for validating an email address. Requires a non-empty local part, an
 * "@", a non-empty domain, a dot, and a non-empty TLD with no whitespace.
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Determine whether a field's current value should be treated as "empty". */
function isEmptyValue(field: FormFieldDef, value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (field.parameterType === "date-range" && typeof value === "object") {
    const r = value as { from?: string; to?: string };
    return !r.from && !r.to;
  }
  return false;
}

/**
 * Validate a single field's value. Returns an error message string when the
 * value is invalid, or `null` when it is valid.
 *
 * Rules (in order):
 *  1. If the field is required and empty, report required error.
 *  2. If the value is empty and not required, no error.
 *  3. Otherwise apply the field's `validationType` (number / email / date).
 */
export function validateFieldValue(
  field: FormFieldDef,
  value: unknown,
): string | null {
  const empty = isEmptyValue(field, value);

  if (field.required && empty) {
    return "This field is required";
  }

  if (empty) return null;

  const validationType = field.validationType ?? "text";
  if (validationType === "text") return null;

  const stringValue = typeof value === "string" ? value : String(value);

  switch (validationType) {
    case "number": {
      if (stringValue.trim() === "") return null;
      return Number.isNaN(Number(stringValue))
        ? "Must be a valid number"
        : null;
    }
    case "email": {
      return EMAIL_REGEX.test(stringValue)
        ? null
        : "Must be a valid email address";
    }
    case "date": {
      return Number.isNaN(Date.parse(stringValue))
        ? "Must be a valid date"
        : null;
    }
    default:
      return null;
  }
}
