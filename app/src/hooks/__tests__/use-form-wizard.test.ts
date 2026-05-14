// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFormWizard } from "../use-form-wizard";
import type { FormFieldDef } from "@/lib/widget/form-field-def";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

const singleStepFields: FormFieldDef[] = [
  makeField({ parameterName: "name" }),
  makeField({ parameterName: "email" }),
];

const wizardFields: FormFieldDef[] = [
  makeField({ parameterName: "name", step: 0, required: true }),
  makeField({ parameterName: "email", step: 0 }),
  makeField({ parameterName: "age", step: 1, required: true }),
  makeField({ parameterName: "city", step: 2 }),
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useFormWizard", () => {
  describe("wizard detection", () => {
    it("returns isWizard=false when no fields have step", () => {
      const { result } = renderHook(() => useFormWizard(singleStepFields, {}));
      expect(result.current.isWizard).toBe(false);
    });

    it("returns isWizard=true when fields have step assigned", () => {
      const { result } = renderHook(() => useFormWizard(wizardFields, {}));
      expect(result.current.isWizard).toBe(true);
    });

    it("returns isWizard=false for empty fields", () => {
      const { result } = renderHook(() => useFormWizard([], {}));
      expect(result.current.isWizard).toBe(false);
    });
  });

  describe("step grouping", () => {
    it("groups all fields into one step when no wizard", () => {
      const { result } = renderHook(() => useFormWizard(singleStepFields, {}));
      expect(result.current.stepGroups).toHaveLength(1);
      expect(result.current.stepGroups[0]).toEqual(singleStepFields);
    });

    it("groups fields by step number", () => {
      const { result } = renderHook(() => useFormWizard(wizardFields, {}));
      expect(result.current.stepGroups).toHaveLength(3);
      expect(result.current.stepGroups[0]).toHaveLength(2); // step 0: name, email
      expect(result.current.stepGroups[1]).toHaveLength(1); // step 1: age
      expect(result.current.stepGroups[2]).toHaveLength(1); // step 2: city
    });

    it("normalizes gaps in step numbers", () => {
      const gappedFields: FormFieldDef[] = [
        makeField({ parameterName: "a", step: 0 }),
        makeField({ parameterName: "b", step: 5 }),
        makeField({ parameterName: "c", step: 10 }),
      ];
      const { result } = renderHook(() => useFormWizard(gappedFields, {}));
      expect(result.current.stepGroups).toHaveLength(3);
      expect(result.current.totalSteps).toBe(3);
    });
  });

  describe("initial state", () => {
    it("starts at step 0", () => {
      const { result } = renderHook(() => useFormWizard(wizardFields, {}));
      expect(result.current.currentStep).toBe(0);
    });

    it("returns currentFields for step 0", () => {
      const { result } = renderHook(() => useFormWizard(wizardFields, {}));
      expect(result.current.currentFields).toHaveLength(2);
      expect(result.current.currentFields[0].parameterName).toBe("name");
      expect(result.current.currentFields[1].parameterName).toBe("email");
    });

    it("totalSteps matches number of step groups", () => {
      const { result } = renderHook(() => useFormWizard(wizardFields, {}));
      expect(result.current.totalSteps).toBe(3);
    });

    it("isLastStep is false on step 0 with multiple steps", () => {
      const { result } = renderHook(() => useFormWizard(wizardFields, {}));
      expect(result.current.isLastStep).toBe(false);
    });

    it("isSummaryStep is false on step 0", () => {
      const { result } = renderHook(() => useFormWizard(wizardFields, {}));
      expect(result.current.isSummaryStep).toBe(false);
    });
  });

  describe("step labels", () => {
    it("generates default labels when none configured", () => {
      const { result } = renderHook(() => useFormWizard(wizardFields, {}));
      // 3 content steps + "Review" summary
      expect(result.current.stepLabels).toEqual([
        "Step 1",
        "Step 2",
        "Step 3",
        "Review",
      ]);
    });

    it("uses configured stepLabels from chartOptions", () => {
      const { result } = renderHook(() =>
        useFormWizard(wizardFields, {
          stepLabels: ["Personal", "Details", "Location"],
        }),
      );
      expect(result.current.stepLabels).toEqual([
        "Personal",
        "Details",
        "Location",
        "Review",
      ]);
    });

    it("falls back to default for missing configured labels", () => {
      const { result } = renderHook(() =>
        useFormWizard(wizardFields, {
          stepLabels: ["Personal"],
        }),
      );
      expect(result.current.stepLabels[0]).toBe("Personal");
      expect(result.current.stepLabels[1]).toBe("Step 2");
      expect(result.current.stepLabels[2]).toBe("Step 3");
    });

    it("omits Review label when enableSummary is false", () => {
      const { result } = renderHook(() =>
        useFormWizard(wizardFields, { enableSummary: false }),
      );
      expect(result.current.stepLabels).toEqual(["Step 1", "Step 2", "Step 3"]);
    });

    it("does not add Review label for non-wizard forms", () => {
      const { result } = renderHook(() => useFormWizard(singleStepFields, {}));
      expect(result.current.stepLabels).toEqual(["Step 1"]);
    });
  });

  describe("goNext", () => {
    it("advances step when all fields are valid", () => {
      const { result } = renderHook(() => useFormWizard(wizardFields, {}));

      act(() => {
        const errors = result.current.goNext({
          name: "Alice",
          email: "alice@example.com",
        });
        expect(errors).toBeNull();
      });

      expect(result.current.currentStep).toBe(1);
    });

    it("returns validation errors when required fields are empty", () => {
      const { result } = renderHook(() => useFormWizard(wizardFields, {}));

      let errors: Record<string, string> | null = null;
      act(() => {
        errors = result.current.goNext({ name: "", email: "" });
      });

      expect(errors).toEqual({ name: "This field is required" });
      expect(result.current.currentStep).toBe(0); // did NOT advance
    });

    it("advances through multiple steps sequentially", () => {
      const { result } = renderHook(() => useFormWizard(wizardFields, {}));

      // Step 0 → 1
      act(() => {
        result.current.goNext({ name: "Alice" });
      });
      expect(result.current.currentStep).toBe(1);
      expect(result.current.currentFields[0].parameterName).toBe("age");

      // Step 1 → 2
      act(() => {
        result.current.goNext({ age: "30" });
      });
      expect(result.current.currentStep).toBe(2);
      expect(result.current.isLastStep).toBe(true);
    });

    it("advances to summary step from last content step", () => {
      const { result } = renderHook(() => useFormWizard(wizardFields, {}));

      // Navigate to last content step
      act(() => {
        result.current.goNext({ name: "Alice" });
      });
      act(() => {
        result.current.goNext({ age: "30" });
      });
      act(() => {
        result.current.goNext({ city: "NYC" });
      });

      expect(result.current.currentStep).toBe(3);
      expect(result.current.isSummaryStep).toBe(true);
      // Summary step shows all fields
      expect(result.current.currentFields).toEqual(wizardFields);
    });
  });

  describe("goBack", () => {
    it("goes to previous step", () => {
      const { result } = renderHook(() => useFormWizard(wizardFields, {}));

      // Advance to step 1
      act(() => {
        result.current.goNext({ name: "Alice" });
      });
      expect(result.current.currentStep).toBe(1);

      // Go back
      act(() => {
        result.current.goBack();
      });
      expect(result.current.currentStep).toBe(0);
    });

    it("clamps at step 0", () => {
      const { result } = renderHook(() => useFormWizard(wizardFields, {}));
      expect(result.current.currentStep).toBe(0);

      act(() => {
        result.current.goBack();
      });
      expect(result.current.currentStep).toBe(0);
    });

    it("does not validate when going back", () => {
      const { result } = renderHook(() => useFormWizard(wizardFields, {}));

      // Go to step 1
      act(() => {
        result.current.goNext({ name: "Alice" });
      });

      // Go back — no validation needed
      act(() => {
        result.current.goBack();
      });
      expect(result.current.currentStep).toBe(0);
    });
  });

  describe("goToStep", () => {
    it("allows jumping backward to a completed step", () => {
      const { result } = renderHook(() => useFormWizard(wizardFields, {}));

      // Advance to step 2
      act(() => {
        result.current.goNext({ name: "Alice" });
      });
      act(() => {
        result.current.goNext({ age: "30" });
      });
      expect(result.current.currentStep).toBe(2);

      // Jump back to step 0
      act(() => {
        result.current.goToStep(0);
      });
      expect(result.current.currentStep).toBe(0);
    });

    it("prevents jumping forward", () => {
      const { result } = renderHook(() => useFormWizard(wizardFields, {}));
      expect(result.current.currentStep).toBe(0);

      act(() => {
        result.current.goToStep(2);
      });
      expect(result.current.currentStep).toBe(0); // unchanged
    });

    it("prevents jumping to negative step", () => {
      const { result } = renderHook(() => useFormWizard(wizardFields, {}));

      // Advance to step 1
      act(() => {
        result.current.goNext({ name: "Alice" });
      });
      expect(result.current.currentStep).toBe(1);

      act(() => {
        result.current.goToStep(-1);
      });
      expect(result.current.currentStep).toBe(1); // unchanged
    });
  });

  describe("reset", () => {
    it("returns to step 0", () => {
      const { result } = renderHook(() => useFormWizard(wizardFields, {}));

      // Advance a few steps
      act(() => {
        result.current.goNext({ name: "Alice" });
      });
      act(() => {
        result.current.goNext({ age: "30" });
      });
      expect(result.current.currentStep).toBe(2);

      act(() => {
        result.current.reset();
      });
      expect(result.current.currentStep).toBe(0);
    });
  });

  describe("summary step", () => {
    it("isSummaryStep is true on the step after the last content step", () => {
      const { result } = renderHook(() => useFormWizard(wizardFields, {}));

      // Navigate through all content steps
      act(() => {
        result.current.goNext({ name: "Alice" });
      });
      act(() => {
        result.current.goNext({ age: "30" });
      });
      act(() => {
        result.current.goNext({ city: "NYC" });
      });

      expect(result.current.isSummaryStep).toBe(true);
      expect(result.current.currentStep).toBe(3); // totalSteps = 3
    });

    it("currentFields returns all fields on summary step", () => {
      const { result } = renderHook(() => useFormWizard(wizardFields, {}));

      act(() => {
        result.current.goNext({ name: "Alice" });
      });
      act(() => {
        result.current.goNext({ age: "30" });
      });
      act(() => {
        result.current.goNext({ city: "NYC" });
      });

      expect(result.current.currentFields).toHaveLength(4);
    });

    it("disables summary step when enableSummary is false", () => {
      const { result } = renderHook(() =>
        useFormWizard(wizardFields, { enableSummary: false }),
      );

      act(() => {
        result.current.goNext({ name: "Alice" });
      });
      act(() => {
        result.current.goNext({ age: "30" });
      });

      // On last content step
      expect(result.current.isLastStep).toBe(true);
      expect(result.current.isSummaryStep).toBe(false);

      // Advance past last step
      act(() => {
        result.current.goNext({ city: "NYC" });
      });

      // Should NOT show summary
      expect(result.current.isSummaryStep).toBe(false);
    });
  });

  describe("non-wizard form", () => {
    it("returns all fields as currentFields", () => {
      const { result } = renderHook(() => useFormWizard(singleStepFields, {}));
      expect(result.current.currentFields).toEqual(singleStepFields);
    });

    it("totalSteps is 1", () => {
      const { result } = renderHook(() => useFormWizard(singleStepFields, {}));
      expect(result.current.totalSteps).toBe(1);
    });

    it("isLastStep is true on the only step", () => {
      const { result } = renderHook(() => useFormWizard(singleStepFields, {}));
      expect(result.current.isLastStep).toBe(true);
    });
  });
});
