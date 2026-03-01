"use client";

import React, { useState, useCallback } from "react";
import { FormWidget } from "@neoboard/components";
import { useWriteQueryExecution } from "@/hooks/use-write-query-execution";
import { deriveFormFields } from "@/lib/derive-form-fields";
import type { FormFieldConfig } from "@/lib/derive-form-fields";

export interface FormWidgetRendererProps {
  connectionId: string;
  query: string;
  settings?: Record<string, unknown>;
}

export function FormWidgetRenderer({
  connectionId,
  query,
  settings = {},
}: FormWidgetRendererProps) {
  const fields = deriveFormFields(
    query,
    settings.fieldConfig as Record<string, FormFieldConfig> | undefined,
  );

  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const f of fields) {
      initial[f.name] = "";
    }
    return initial;
  });

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const writeQuery = useWriteQueryExecution();

  const handleFieldChange = useCallback((name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setSuccessMessage(null);
    setErrorMessage(null);
  }, []);

  const handleSubmit = useCallback(
    (formValues: Record<string, string>) => {
      setSuccessMessage(null);
      setErrorMessage(null);

      writeQuery.mutate(
        { connectionId, query, params: formValues },
        {
          onSuccess: () => {
            const msg =
              (settings.chartOptions as Record<string, unknown> | undefined)
                ?.successMessage as string | undefined;
            setSuccessMessage(msg || "Form submitted successfully");

            const resetOnSuccess =
              (settings.chartOptions as Record<string, unknown> | undefined)
                ?.resetOnSuccess;
            if (resetOnSuccess !== false) {
              setValues((prev) => {
                const reset: Record<string, string> = {};
                for (const key of Object.keys(prev)) {
                  reset[key] = "";
                }
                return reset;
              });
            }
          },
          onError: (err) => {
            setErrorMessage(err.message);
          },
        },
      );
    },
    [connectionId, query, settings, writeQuery],
  );

  const chartOptions = (settings.chartOptions ?? {}) as Record<string, unknown>;

  return (
    <div className="h-full overflow-auto">
      <FormWidget
        fields={fields}
        values={values}
        onFieldChange={handleFieldChange}
        onSubmit={handleSubmit}
        submitButtonText={(chartOptions.submitButtonText as string) || undefined}
        isSubmitting={writeQuery.isPending}
        successMessage={successMessage}
        errorMessage={errorMessage}
      />
    </div>
  );
}
