"use client";

import React, { useState, useCallback, useEffect, useMemo } from "react";
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

  // Stable key for field names so useEffect only fires when fields actually change
  const fieldKey = useMemo(() => fields.map((f) => f.name).join(","), [fields]);

  const [values, setValues] = useState<Record<string, string>>({});

  // Sync form values when fields change (e.g. user edits the query)
  useEffect(() => {
    setValues((prev) => {
      const next: Record<string, string> = {};
      for (const f of fields) {
        next[f.name] = prev[f.name] ?? "";
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldKey]);

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
