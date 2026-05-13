import { useState, useMemo, useCallback } from "react";
import type { FormFieldDef } from "@/lib/widget/form-field-def";
import { isWizardForm, groupFieldsByStep } from "@/lib/widget/form-field-def";
import { validateStepFields } from "@/lib/widget/form-field-validation";

export interface FormWizardState {
  /** Whether this form uses multi-step wizard mode */
  isWizard: boolean;
  /** Current step index (0-based) */
  currentStep: number;
  /** Total number of steps (excluding summary) */
  totalSteps: number;
  /** Fields grouped by step */
  stepGroups: FormFieldDef[][];
  /** Fields for the current step */
  currentFields: FormFieldDef[];
  /** Whether we're on the last content step (next = summary or submit) */
  isLastStep: boolean;
  /** Whether we're on the summary step */
  isSummaryStep: boolean;
  /** Step labels for the indicator */
  stepLabels: string[];
  /** Go to next step. Validates current step first. Returns errors or null. */
  goNext: (
    localValues: Record<string, unknown>,
  ) => Record<string, string> | null;
  /** Go to previous step. No validation. */
  goBack: () => void;
  /** Jump to a specific step (for clicking completed steps). */
  goToStep: (step: number) => void;
  /** Reset to step 0 (e.g. after successful submit). */
  reset: () => void;
}

/**
 * Hook that manages multi-step form wizard state.
 * Returns a flat interface — non-wizard forms get a single "step" with all fields.
 */
export function useFormWizard(
  fields: FormFieldDef[],
  chartOptions: Record<string, unknown>,
): FormWizardState {
  const [currentStep, setCurrentStep] = useState(0);

  const isWizard = useMemo(() => isWizardForm(fields), [fields]);
  const stepGroups = useMemo(() => groupFieldsByStep(fields), [fields]);
  const enableSummary = isWizard && chartOptions.enableSummary !== false;
  const totalSteps = stepGroups.length;

  const configuredLabels =
    (chartOptions.stepLabels as string[] | undefined) ?? [];
  const stepLabels = useMemo(() => {
    const labels = stepGroups.map(
      (_, i) => configuredLabels[i] || `Step ${i + 1}`,
    );
    if (enableSummary) labels.push("Review");
    return labels;
  }, [stepGroups, configuredLabels, enableSummary]);

  const isSummaryStep = enableSummary && currentStep === totalSteps;
  const isLastStep = currentStep === totalSteps - 1;
  const currentFields = isSummaryStep
    ? fields // Summary shows all fields
    : (stepGroups[currentStep] ?? []);

  const goNext = useCallback(
    (localValues: Record<string, unknown>) => {
      const stepFields = stepGroups[currentStep] ?? [];
      const errors = validateStepFields(stepFields, localValues);
      if (Object.keys(errors).length > 0) return errors;
      setCurrentStep((s) => s + 1);
      return null;
    },
    [currentStep, stepGroups],
  );

  const goBack = useCallback(() => {
    setCurrentStep((s) => Math.max(0, s - 1));
  }, []);

  const goToStep = useCallback(
    (step: number) => {
      if (step < currentStep) setCurrentStep(step);
    },
    [currentStep],
  );

  const reset = useCallback(() => setCurrentStep(0), []);

  return {
    isWizard,
    currentStep,
    totalSteps,
    stepGroups,
    currentFields,
    isLastStep,
    isSummaryStep,
    stepLabels,
    goNext,
    goBack,
    goToStep,
    reset,
  };
}
