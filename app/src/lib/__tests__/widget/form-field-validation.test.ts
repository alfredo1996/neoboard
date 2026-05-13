import { describe, it, expect } from "vitest";
import {
  validateFieldValue,
  validateStepFields,
} from "@/lib/widget/form-field-validation";
import type { FormFieldDef } from "@/lib/widget/form-field-def";

describe("validateFieldValue", () => {
  const baseField: FormFieldDef = {
    id: "1",
    label: "Field",
    parameterName: "field",
    parameterType: "text",
  };

  describe("required validation", () => {
    it("returns error when required field is empty string", () => {
      const field: FormFieldDef = { ...baseField, required: true };
      expect(validateFieldValue(field, "")).toBe("This field is required");
    });

    it("returns error when required field is undefined", () => {
      const field: FormFieldDef = { ...baseField, required: true };
      expect(validateFieldValue(field, undefined)).toBe(
        "This field is required",
      );
    });

    it("returns error when required field is null", () => {
      const field: FormFieldDef = { ...baseField, required: true };
      expect(validateFieldValue(field, null)).toBe("This field is required");
    });

    it("returns error when required field is an empty array", () => {
      const field: FormFieldDef = {
        ...baseField,
        parameterType: "multi-select",
        required: true,
      };
      expect(validateFieldValue(field, [])).toBe("This field is required");
    });

    it("returns error when required date-range has no from and no to", () => {
      const field: FormFieldDef = {
        ...baseField,
        parameterType: "date-range",
        required: true,
      };
      expect(validateFieldValue(field, { from: "", to: "" })).toBe(
        "This field is required",
      );
      expect(validateFieldValue(field, {})).toBe("This field is required");
    });

    it("returns null when required field has a value", () => {
      const field: FormFieldDef = { ...baseField, required: true };
      expect(validateFieldValue(field, "hello")).toBeNull();
    });

    it("returns null when optional field is empty", () => {
      const field: FormFieldDef = { ...baseField, required: false };
      expect(validateFieldValue(field, "")).toBeNull();
      expect(validateFieldValue(field, undefined)).toBeNull();
    });
  });

  describe("number validation", () => {
    it("returns error when value is not numeric", () => {
      const field: FormFieldDef = { ...baseField, validationType: "number" };
      expect(validateFieldValue(field, "abc")).toBe("Must be a valid number");
    });

    it("returns null when value is a numeric string", () => {
      const field: FormFieldDef = { ...baseField, validationType: "number" };
      expect(validateFieldValue(field, "42")).toBeNull();
      expect(validateFieldValue(field, "3.14")).toBeNull();
      expect(validateFieldValue(field, "-7")).toBeNull();
    });

    it("returns null when value is empty and field is optional", () => {
      const field: FormFieldDef = { ...baseField, validationType: "number" };
      expect(validateFieldValue(field, "")).toBeNull();
    });

    it("returns required error when empty and required takes precedence", () => {
      const field: FormFieldDef = {
        ...baseField,
        validationType: "number",
        required: true,
      };
      expect(validateFieldValue(field, "")).toBe("This field is required");
    });
  });

  describe("email validation", () => {
    it("returns error for invalid email strings", () => {
      const field: FormFieldDef = { ...baseField, validationType: "email" };
      expect(validateFieldValue(field, "not-an-email")).toBe(
        "Must be a valid email address",
      );
      expect(validateFieldValue(field, "foo@")).toBe(
        "Must be a valid email address",
      );
      expect(validateFieldValue(field, "@bar.com")).toBe(
        "Must be a valid email address",
      );
      expect(validateFieldValue(field, "foo @bar.com")).toBe(
        "Must be a valid email address",
      );
    });

    it("returns null for valid email addresses", () => {
      const field: FormFieldDef = { ...baseField, validationType: "email" };
      expect(validateFieldValue(field, "user@example.com")).toBeNull();
      expect(
        validateFieldValue(field, "first.last+tag@sub.example.co"),
      ).toBeNull();
    });

    it("returns null when empty and optional", () => {
      const field: FormFieldDef = { ...baseField, validationType: "email" };
      expect(validateFieldValue(field, "")).toBeNull();
    });
  });

  describe("date validation", () => {
    it("returns error for unparseable dates", () => {
      const field: FormFieldDef = { ...baseField, validationType: "date" };
      expect(validateFieldValue(field, "not-a-date")).toBe(
        "Must be a valid date",
      );
    });

    it("returns null for valid dates", () => {
      const field: FormFieldDef = { ...baseField, validationType: "date" };
      expect(validateFieldValue(field, "2024-01-15")).toBeNull();
      expect(validateFieldValue(field, "2024-12-31T23:59:59Z")).toBeNull();
    });

    it("returns null when empty and optional", () => {
      const field: FormFieldDef = { ...baseField, validationType: "date" };
      expect(validateFieldValue(field, "")).toBeNull();
    });
  });

  describe("text validation", () => {
    it("returns null for any non-empty text when no validationType set", () => {
      const field: FormFieldDef = { ...baseField };
      expect(validateFieldValue(field, "hello world")).toBeNull();
    });

    it("returns null for non-validated fields without required", () => {
      const field: FormFieldDef = { ...baseField, validationType: "text" };
      expect(validateFieldValue(field, "anything")).toBeNull();
      expect(validateFieldValue(field, "")).toBeNull();
    });
  });
});

describe("validateStepFields", () => {
  it("returns empty object when all fields are valid", () => {
    const fields: FormFieldDef[] = [
      {
        id: "1",
        label: "Name",
        parameterName: "name",
        parameterType: "text",
        required: true,
      },
    ];
    const errors = validateStepFields(fields, { name: "Alice" });
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it("returns errors for invalid fields", () => {
    const fields: FormFieldDef[] = [
      {
        id: "1",
        label: "Name",
        parameterName: "name",
        parameterType: "text",
        required: true,
      },
      {
        id: "2",
        label: "Email",
        parameterName: "email",
        parameterType: "text",
        required: true,
      },
    ];
    const errors = validateStepFields(fields, { name: "Alice" });
    expect(errors.email).toBe("This field is required");
    expect(errors.name).toBeUndefined();
  });

  it("returns empty object for empty fields array", () => {
    expect(Object.keys(validateStepFields([], {}))).toHaveLength(0);
  });
});
