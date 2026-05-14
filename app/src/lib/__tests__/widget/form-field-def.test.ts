import { describe, it, expect } from "vitest";
import {
  buildFormParams,
  isWizardForm,
  groupFieldsByStep,
} from "@/lib/widget/form-field-def";
import type { FormFieldDef } from "@/lib/widget/form-field-def";

describe("buildFormParams", () => {
  it("maps a text field with a value to param_name", () => {
    const fields: FormFieldDef[] = [
      { id: "1", label: "Name", parameterName: "name", parameterType: "text" },
    ];
    const result = buildFormParams(fields, { name: "Alice" });
    expect(result).toEqual({ param_name: "Alice" });
  });

  it("omits a required text field with empty string", () => {
    const fields: FormFieldDef[] = [
      {
        id: "1",
        label: "Name",
        parameterName: "name",
        parameterType: "text",
        required: true,
      },
    ];
    const result = buildFormParams(fields, { name: "" });
    expect(result).toEqual({});
  });

  it("omits a required text field with undefined value", () => {
    const fields: FormFieldDef[] = [
      {
        id: "1",
        label: "Name",
        parameterName: "name",
        parameterType: "text",
        required: true,
      },
    ];
    const result = buildFormParams(fields, {});
    expect(result).toEqual({});
  });

  it("omits a required text field with null value", () => {
    const fields: FormFieldDef[] = [
      {
        id: "1",
        label: "Name",
        parameterName: "name",
        parameterType: "text",
        required: true,
      },
    ];
    const result = buildFormParams(fields, { name: null });
    expect(result).toEqual({});
  });

  it("splits a date-range field into param_X_from and param_X_to", () => {
    const fields: FormFieldDef[] = [
      {
        id: "1",
        label: "Date Range",
        parameterName: "period",
        parameterType: "date-range",
      },
    ];
    const result = buildFormParams(fields, {
      period: { from: "2024-01-01", to: "2024-12-31" },
    });
    expect(result).toEqual({
      param_period_from: "2024-01-01",
      param_period_to: "2024-12-31",
    });
  });

  it("splits a number-range field into param_X_min and param_X_max", () => {
    const fields: FormFieldDef[] = [
      {
        id: "1",
        label: "Rating",
        parameterName: "rating",
        parameterType: "number-range",
      },
    ];
    const result = buildFormParams(fields, { rating: [1, 5] });
    expect(result).toEqual({ param_rating_min: 1, param_rating_max: 5 });
  });

  it("includes all fields when multiple fields have values", () => {
    const fields: FormFieldDef[] = [
      { id: "1", label: "Name", parameterName: "name", parameterType: "text" },
      {
        id: "2",
        label: "Email",
        parameterName: "email",
        parameterType: "text",
      },
    ];
    const result = buildFormParams(fields, {
      name: "Alice",
      email: "alice@example.com",
    });
    expect(result).toEqual({
      param_name: "Alice",
      param_email: "alice@example.com",
    });
  });

  it("maps a multi-select field with array value", () => {
    const fields: FormFieldDef[] = [
      {
        id: "1",
        label: "Tags",
        parameterName: "tags",
        parameterType: "multi-select",
      },
    ];
    const result = buildFormParams(fields, { tags: ["a", "b"] });
    expect(result).toEqual({ param_tags: ["a", "b"] });
  });

  it("omits required date-range field when both from and to are missing", () => {
    const fields: FormFieldDef[] = [
      {
        id: "1",
        label: "Period",
        parameterName: "period",
        parameterType: "date-range",
        required: true,
      },
    ];
    const result = buildFormParams(fields, { period: {} });
    expect(result).toEqual({});
  });

  it("optional text field with empty string passes null instead of omitting", () => {
    const fields: FormFieldDef[] = [
      {
        id: "1",
        label: "Name",
        parameterName: "name",
        parameterType: "text",
        required: false,
      },
    ];
    const result = buildFormParams(fields, { name: "" });
    expect(result).toEqual({ param_name: null });
  });

  it("optional text field with undefined value passes null", () => {
    const fields: FormFieldDef[] = [
      {
        id: "1",
        label: "Name",
        parameterName: "name",
        parameterType: "text",
        required: false,
      },
    ];
    const result = buildFormParams(fields, {});
    expect(result).toEqual({ param_name: null });
  });

  it("optional date-range with empty object passes null for from and to", () => {
    const fields: FormFieldDef[] = [
      {
        id: "1",
        label: "Period",
        parameterName: "period",
        parameterType: "date-range",
        required: false,
      },
    ];
    const result = buildFormParams(fields, { period: {} });
    expect(result).toEqual({ param_period_from: null, param_period_to: null });
  });

  it("optional number-range with null value passes null for min and max", () => {
    const fields: FormFieldDef[] = [
      {
        id: "1",
        label: "Rating",
        parameterName: "rating",
        parameterType: "number-range",
        required: false,
      },
    ];
    const result = buildFormParams(fields, { rating: null });
    expect(result).toEqual({ param_rating_min: null, param_rating_max: null });
  });

  it("handles date-range with only from value", () => {
    const fields: FormFieldDef[] = [
      {
        id: "1",
        label: "Period",
        parameterName: "period",
        parameterType: "date-range",
      },
    ];
    const result = buildFormParams(fields, { period: { from: "2024-01-01" } });
    expect(result).toEqual({ param_period_from: "2024-01-01" });
  });
});

describe("isWizardForm", () => {
  it("returns false when no fields have step", () => {
    const fields: FormFieldDef[] = [
      { id: "1", label: "Name", parameterName: "name", parameterType: "text" },
    ];
    expect(isWizardForm(fields)).toBe(false);
  });

  it("returns true when at least one field has step", () => {
    const fields: FormFieldDef[] = [
      {
        id: "1",
        label: "Name",
        parameterName: "name",
        parameterType: "text",
        step: 0,
      },
    ];
    expect(isWizardForm(fields)).toBe(true);
  });

  it("returns false for empty fields array", () => {
    expect(isWizardForm([])).toBe(false);
  });
});

describe("groupFieldsByStep", () => {
  it("groups fields by step number", () => {
    const fields: FormFieldDef[] = [
      {
        id: "1",
        label: "Name",
        parameterName: "name",
        parameterType: "text",
        step: 0,
      },
      {
        id: "2",
        label: "Email",
        parameterName: "email",
        parameterType: "text",
        step: 0,
      },
      {
        id: "3",
        label: "Role",
        parameterName: "role",
        parameterType: "select",
        step: 1,
      },
    ];
    const groups = groupFieldsByStep(fields);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveLength(2);
    expect(groups[1]).toHaveLength(1);
  });

  it("normalizes gaps in step numbers", () => {
    const fields: FormFieldDef[] = [
      {
        id: "1",
        label: "A",
        parameterName: "a",
        parameterType: "text",
        step: 0,
      },
      {
        id: "2",
        label: "B",
        parameterName: "b",
        parameterType: "text",
        step: 5,
      },
    ];
    const groups = groupFieldsByStep(fields);
    // Should normalize to 2 sequential steps, not 6
    expect(groups).toHaveLength(2);
  });

  it("treats fields without step as step 0", () => {
    const fields: FormFieldDef[] = [
      { id: "1", label: "A", parameterName: "a", parameterType: "text" },
      {
        id: "2",
        label: "B",
        parameterName: "b",
        parameterType: "text",
        step: 1,
      },
    ];
    const groups = groupFieldsByStep(fields);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveLength(1);
    expect(groups[0][0].parameterName).toBe("a");
  });

  it("returns single group for non-wizard forms", () => {
    const fields: FormFieldDef[] = [
      { id: "1", label: "A", parameterName: "a", parameterType: "text" },
      { id: "2", label: "B", parameterName: "b", parameterType: "text" },
    ];
    const groups = groupFieldsByStep(fields);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(2);
  });
});
