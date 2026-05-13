import { describe, it, expect, vi } from "vitest";
import React from "react";

/* ---------- mocks (needed to import form-widget-renderer) ---------- */

vi.mock("next-auth/react", () => ({ useSession: () => ({ data: null }) }));
vi.mock("@neoboard/components", () => ({
  ParamSelector: () => <div />,
  ParamMultiSelector: () => <div />,
  DatePickerParameter: () => <div />,
  DateRangeParameter: () => <div />,
  DateRelativePicker: () => <div />,
  NumberRangeSlider: () => <div />,
  CascadingSelector: () => <div />,
  FormStepIndicator: () => <div />,
  Button: () => <button />,
  Label: () => <label />,
}));
vi.mock("@/components/debounced-text-input", () => ({
  DebouncedTextInput: () => <input />,
}));
vi.mock("@/stores/parameter-store", () => ({ useParameterValues: () => ({}) }));
vi.mock("@/hooks/use-write-query-execution", () => ({
  useWriteQueryExecution: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-seed-query", () => ({
  useSeedQuery: () => ({ options: [], loading: false }),
}));
vi.mock("@/hooks/use-form-wizard", () => ({
  useFormWizard: () => ({
    isWizard: false,
    currentStep: 0,
    totalSteps: 1,
    stepGroups: [],
    currentFields: [],
    isLastStep: true,
    isSummaryStep: false,
    stepLabels: [],
    goNext: vi.fn(),
    goBack: vi.fn(),
    goToStep: vi.fn(),
    reset: vi.fn(),
  }),
}));
vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>(
    "@tanstack/react-query",
  );
  return { ...actual, useQueryClient: () => ({ invalidateQueries: vi.fn() }) };
});

/* ---------- import under test ---------- */
import { formatSummaryValue } from "../form-widget-renderer";
import type { FormFieldDef } from "@/lib/widget/form-field-def";

/* ---------- helpers ---------- */

function makeField(
  overrides: Partial<FormFieldDef> & { parameterName: string },
): FormFieldDef {
  return {
    id: overrides.parameterName,
    label: overrides.parameterName,
    parameterType: "text",
    ...overrides,
  };
}

/* ---------- tests ---------- */

describe("formatSummaryValue", () => {
  const textField = makeField({ parameterName: "name" });

  describe("empty values", () => {
    it("returns dash for undefined", () => {
      expect(formatSummaryValue(undefined, textField)).toBe("—");
    });

    it("returns dash for null", () => {
      expect(formatSummaryValue(null, textField)).toBe("—");
    });

    it("returns dash for empty string", () => {
      expect(formatSummaryValue("", textField)).toBe("—");
    });
  });

  describe("number-range", () => {
    const rangeField = makeField({
      parameterName: "price",
      parameterType: "number-range",
    });

    it("formats as min – max", () => {
      expect(formatSummaryValue([10, 50], rangeField)).toBe("10 – 50");
    });

    it("handles zero values", () => {
      expect(formatSummaryValue([0, 100], rangeField)).toBe("0 – 100");
    });
  });

  describe("arrays (multi-select)", () => {
    const multiField = makeField({
      parameterName: "tags",
      parameterType: "multi-select",
    });

    it("joins array values with comma", () => {
      expect(formatSummaryValue(["a", "b", "c"], multiField)).toBe("a, b, c");
    });

    it("returns dash for empty array", () => {
      expect(formatSummaryValue([], multiField)).toBe("—");
    });

    it("handles single-element array", () => {
      expect(formatSummaryValue(["only"], multiField)).toBe("only");
    });
  });

  describe("date-range", () => {
    const dateRangeField = makeField({
      parameterName: "period",
      parameterType: "date-range",
    });

    it("formats from → to when both present", () => {
      expect(
        formatSummaryValue(
          { from: "2026-01-01", to: "2026-12-31" },
          dateRangeField,
        ),
      ).toBe("2026-01-01 → 2026-12-31");
    });

    it("formats From prefix when only from", () => {
      expect(formatSummaryValue({ from: "2026-01-01" }, dateRangeField)).toBe(
        "From 2026-01-01",
      );
    });

    it("formats To prefix when only to", () => {
      expect(formatSummaryValue({ to: "2026-12-31" }, dateRangeField)).toBe(
        "To 2026-12-31",
      );
    });

    it("returns dash when both from and to are empty", () => {
      expect(formatSummaryValue({ from: "", to: "" }, dateRangeField)).toBe(
        "—",
      );
    });
  });

  describe("scalar values", () => {
    it("stringifies numbers", () => {
      expect(formatSummaryValue(42, textField)).toBe("42");
    });

    it("passes strings through", () => {
      expect(formatSummaryValue("hello", textField)).toBe("hello");
    });

    it("stringifies booleans", () => {
      expect(formatSummaryValue(true, textField)).toBe("true");
    });
  });
});
