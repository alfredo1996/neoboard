"use client";

import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ParamSelector,
  ParamMultiSelector,
  DatePickerParameter,
  DateRangeParameter,
  DateRelativePicker,
  NumberRangeSlider,
  CascadingSelector,
  Button,
  Label,
  type RelativeDatePreset,
} from "@neoboard/components";
import { FormStepIndicator } from "@neoboard/components";
import { useParameterValues } from "@/stores/parameter-store";
import { useWriteQueryExecution } from "@/hooks/use-write-query-execution";
import { useFormWizard } from "@/hooks/use-form-wizard";
import { useSeedQuery } from "@/hooks/use-seed-query";
import { buildFormParams } from "@/lib/widget/form-field-def";
import type { FormFieldDef } from "@/lib/widget/form-field-def";
import { validateFieldValue } from "@/lib/widget/form-field-validation";
import { DebouncedTextInput } from "./debounced-text-input";

export interface FormWidgetRendererProps {
  connectionId: string;
  query: string;
  settings?: Record<string, unknown>;
}

// ─── Per-field input renderer (local state, no global store) ──────────────────

interface FieldInputProps {
  field: FormFieldDef;
  value: unknown;
  onChange: (name: string, value: unknown) => void;
  connectionId: string;
  tenantId?: string;
  // The current local values map, used by cascading-select for parent lookup
  localValues: Record<string, unknown>;
}

function FieldInput({
  field,
  value,
  onChange,
  connectionId,
  tenantId,
  localValues,
}: FieldInputProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    if (!field.searchable) return;
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm, field.searchable]);

  const parentValue =
    field.parameterType === "cascading-select" && field.parentParameterName
      ? String(localValues[field.parentParameterName] ?? "")
      : undefined;

  const parentParams = useMemo(
    () =>
      field.parentParameterName && parentValue
        ? { [`param_${field.parentParameterName}`]: parentValue }
        : {},
    [field.parentParameterName, parentValue],
  );

  const hasStaticOptions =
    field.parameterType === "select" &&
    !!field.staticOptions &&
    field.staticOptions.trim().length > 0;

  const staticOptionsList = useMemo(() => {
    if (!hasStaticOptions) return [];
    return (field.staticOptions ?? "")
      .split(",")
      .map((o) => o.trim())
      .filter((o) => o.length > 0)
      .map((o) => ({ value: o, label: o, rawValue: o }));
  }, [hasStaticOptions, field.staticOptions]);

  const needsSeed =
    (field.parameterType === "select" && !hasStaticOptions) ||
    field.parameterType === "multi-select" ||
    field.parameterType === "cascading-select";

  const cascadingEnabled =
    field.parameterType !== "cascading-select" ||
    (field.parentParameterName !== undefined ? !!parentValue : true);

  const seedExtraParams = useMemo(() => {
    const base = field.parameterType === "cascading-select" ? parentParams : {};
    if (field.searchable && debouncedSearch) {
      return { ...base, param_search: debouncedSearch };
    }
    return Object.keys(base).length > 0 ? base : undefined;
  }, [field.parameterType, field.searchable, parentParams, debouncedSearch]);

  const { options: seedOptions, loading } = useSeedQuery(
    connectionId,
    field.seedQuery,
    needsSeed && cascadingEnabled,
    seedExtraParams,
    tenantId,
  );

  const options = hasStaticOptions ? staticOptionsList : seedOptions;

  // Clear cascading child when parent changes
  const prevParentValue = useRef(parentValue);
  useEffect(() => {
    if (
      field.parameterType === "cascading-select" &&
      field.parentParameterName &&
      prevParentValue.current !== parentValue
    ) {
      prevParentValue.current = parentValue;
      onChange(field.parameterName, undefined);
    }
  }, [
    field.parameterType,
    field.parentParameterName,
    parentValue,
    field.parameterName,
    onChange,
  ]);

  switch (field.parameterType) {
    case "text": {
      const textValue =
        value !== undefined && value !== null ? String(value) : "";
      return (
        <DebouncedTextInput
          parameterName={field.parameterName}
          value={textValue}
          onChange={(v) => onChange(field.parameterName, v || undefined)}
          placeholder={field.placeholder}
        />
      );
    }

    case "select": {
      const selectValue =
        value !== undefined && value !== null ? String(value) : "";
      return (
        <ParamSelector
          parameterName={field.parameterName}
          options={options}
          value={selectValue}
          onChange={(v) => {
            if (!v) {
              onChange(field.parameterName, undefined);
              return;
            }
            const opt = options.find((o) => o.value === v);
            onChange(
              field.parameterName,
              opt?.rawValue !== undefined ? opt.rawValue : v,
            );
          }}
          placeholder={field.placeholder}
          loading={loading}
          searchable={field.searchable}
          onSearch={field.searchable ? setSearchTerm : undefined}
        />
      );
    }

    case "multi-select": {
      const rawValues = value;
      const multiValues: string[] = Array.isArray(rawValues)
        ? (rawValues as unknown[]).map(String)
        : rawValues
          ? [String(rawValues)]
          : [];
      return (
        <ParamMultiSelector
          parameterName={field.parameterName}
          options={options}
          values={multiValues}
          onChange={(vals) => {
            if (vals.length === 0) {
              onChange(field.parameterName, undefined);
              return;
            }
            const rawVals = vals.map((v) => {
              const opt = options.find((o) => o.value === v);
              return opt?.rawValue !== undefined ? opt.rawValue : v;
            });
            onChange(field.parameterName, rawVals);
          }}
          placeholder={field.placeholder}
          loading={loading}
          searchable={field.searchable}
          onSearch={field.searchable ? setSearchTerm : undefined}
        />
      );
    }

    case "date": {
      const dateValue =
        value !== undefined && value !== null ? String(value) : "";
      return (
        <DatePickerParameter
          parameterName={field.parameterName}
          value={dateValue}
          onChange={(v) => onChange(field.parameterName, v || undefined)}
        />
      );
    }

    case "date-range": {
      const rangeEntry = value as { from?: string; to?: string } | undefined;
      const fromVal = rangeEntry?.from ?? "";
      const toVal = rangeEntry?.to ?? "";
      return (
        <DateRangeParameter
          parameterName={field.parameterName}
          from={fromVal}
          to={toVal}
          onChange={(from, to) => {
            if (!from && !to) {
              onChange(field.parameterName, undefined);
              return;
            }
            onChange(field.parameterName, { from, to });
          }}
        />
      );
    }

    case "date-relative": {
      const relValue = value ? (value as RelativeDatePreset | "") : "";
      return (
        <DateRelativePicker
          parameterName={field.parameterName}
          value={relValue}
          onChange={(preset) =>
            onChange(field.parameterName, preset || undefined)
          }
        />
      );
    }

    case "number-range": {
      const rawRange = value;
      const rangeValue: [number, number] | null = Array.isArray(rawRange)
        ? [Number(rawRange[0]), Number(rawRange[1])]
        : null;
      return (
        <NumberRangeSlider
          parameterName={field.parameterName}
          min={field.rangeMin ?? 0}
          max={field.rangeMax ?? 100}
          step={field.rangeStep ?? 1}
          value={rangeValue}
          onChange={(vals) => onChange(field.parameterName, vals)}
          onClear={() => onChange(field.parameterName, undefined)}
          showInputs
        />
      );
    }

    case "cascading-select": {
      const cascadeValue =
        value !== undefined && value !== null ? String(value) : "";
      return (
        <CascadingSelector
          parameterName={field.parameterName}
          options={options}
          value={cascadeValue}
          onChange={(v) => {
            if (!v) {
              onChange(field.parameterName, undefined);
              return;
            }
            const opt = options.find((o) => o.value === v);
            onChange(
              field.parameterName,
              opt?.rawValue !== undefined ? opt.rawValue : v,
            );
          }}
          parentValue={parentValue}
          parentParameterName={field.parentParameterName}
          loading={loading}
          placeholder={field.placeholder}
        />
      );
    }

    default:
      return null;
  }
}

// ─── Main renderer ────────────────────────────────────────────────────────────

/** Format a field value for the summary step display. */
export function formatSummaryValue(
  value: unknown,
  field: FormFieldDef,
): string {
  if (value === undefined || value === null || value === "") return "—";
  if (field.parameterType === "number-range" && Array.isArray(value)) {
    return `${value[0]} – ${value[1]}`;
  }
  if (Array.isArray(value)) return value.join(", ") || "—";
  if (field.parameterType === "date-range" && typeof value === "object") {
    const r = value as { from?: string; to?: string };
    if (r.from && r.to) return `${r.from} → ${r.to}`;
    if (r.from) return `From ${r.from}`;
    if (r.to) return `To ${r.to}`;
    return "—";
  }
  return String(value);
}

export function FormWidgetRenderer({
  connectionId,
  query,
  settings = {},
}: FormWidgetRendererProps) {
  const fields = useMemo(
    () => (settings?.formFields as FormFieldDef[] | undefined) ?? [],

    [settings?.formFields],
  );
  const chartOptions = useMemo(
    () => (settings.chartOptions ?? {}) as Record<string, unknown>,

    [settings.chartOptions],
  );

  const wizard = useFormWizard(fields, chartOptions);

  const [localValues, setLocalValues] = useState<Record<string, unknown>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const queryClient = useQueryClient();
  const refreshWidgetIds = useMemo(
    () =>
      ((chartOptions as Record<string, unknown>).refreshWidgetIds as
        | string[]
        | undefined) ?? [],
    [chartOptions],
  );

  const { data: session } = useSession();
  const tenantId = session?.user?.tenantId;

  // Proactively gate the form when the viewer has no write permission
  // (issue #496). Readers always land here because session.user.canWrite
  // is hard-coded to false for role=reader in lib/auth/session.ts:65.
  // Creators with a live canWrite toggle fall here too — NextAuth's jwt
  // callback refetches the flag on every token refresh, so the UI
  // updates without requiring a page reload.
  //
  // The server also enforces canWrite at /api/query/write (read from the
  // JWT session claim), so this check is defence-in-depth — it never
  // downgrades the security model, it just stops leading the user into
  // filling in a form they can't submit.
  //
  // `session === undefined` means we haven't loaded yet; default to
  // !canWrite so we don't flash an enabled form to a reader while the
  // session is still resolving.
  // `session === undefined` means the hook hasn't resolved yet. We default
  // to read-only in that window to avoid flashing an enabled form to a
  // reader while the session loads.
  //
  // Readers are gated by role, not by the DB `canWrite` column — the DB
  // value for a reader is often still `true` (it's only enforced at the
  // server via requireSession()), so we must mirror that derivation here:
  // `reader` is always read-only regardless of the column.
  const sessionLoaded = session !== undefined;
  const role = session?.user?.role;
  const canWrite =
    sessionLoaded && role !== "reader" && session?.user?.canWrite !== false;
  const readOnly = sessionLoaded && !canWrite;

  // Seed form fields from external parameters (click-actions, selectors, etc.)
  // Fields the user has manually changed are NOT overwritten by external params.
  const allParams = useParameterValues();
  const touchedFields = useRef(new Set<string>());

  // Stable key of external param values for fields in this form
  const paramSeedKey = fields
    .map((f) => `${f.parameterName}=${allParams[f.parameterName] ?? ""}`)
    .join("|");

  // Sync local values when fields change OR when matching external params change.
  // number-range fields default to [rangeMin, rangeMax] so buildFormParams always
  // includes param_X_min / param_X_max even when the user hasn't moved the slider.
  const fieldKey = fields.map((f) => f.parameterName).join(",");
  useEffect(() => {
    setLocalValues((prev) => {
      const next: Record<string, unknown> = {};
      for (const f of fields) {
        if (
          touchedFields.current.has(f.parameterName) &&
          prev[f.parameterName] !== undefined
        ) {
          // User manually changed this field — preserve their value
          next[f.parameterName] = prev[f.parameterName];
        } else if (allParams[f.parameterName] !== undefined) {
          next[f.parameterName] = allParams[f.parameterName];
        } else if (prev[f.parameterName] !== undefined) {
          next[f.parameterName] = prev[f.parameterName];
        } else if (f.parameterType === "number-range") {
          next[f.parameterName] = [f.rangeMin ?? 0, f.rangeMax ?? 100];
        } else {
          next[f.parameterName] = undefined;
        }
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldKey, paramSeedKey]);

  const handleFieldChange = useCallback((name: string, value: unknown) => {
    touchedFields.current.add(name);
    setLocalValues((prev) => ({ ...prev, [name]: value }));
    setSuccessMessage(null);
    setErrorMessage(null);
    setFieldErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  const handleFieldBlur = useCallback(
    (field: FormFieldDef) => {
      const error = validateFieldValue(field, localValues[field.parameterName]);
      setFieldErrors((prev) => {
        if (error) {
          if (prev[field.parameterName] === error) return prev;
          return { ...prev, [field.parameterName]: error };
        }
        if (!prev[field.parameterName]) return prev;
        const next = { ...prev };
        delete next[field.parameterName];
        return next;
      });
    },
    [localValues],
  );

  const writeQuery = useWriteQueryExecution();

  const handleSubmit = useCallback(() => {
    setSuccessMessage(null);
    setErrorMessage(null);

    // Validate required + validationType for all fields
    const errors: Record<string, string> = {};
    for (const field of fields) {
      const error = validateFieldValue(field, localValues[field.parameterName]);
      if (error) {
        errors[field.parameterName] = error;
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    const params = buildFormParams(fields, localValues);

    writeQuery.mutate(
      { connectionId, query, params },
      {
        onSuccess: () => {
          const msg = chartOptions.successMessage as string | undefined;
          setSuccessMessage(msg || "Form submitted successfully");
          if (chartOptions.resetOnSuccess !== false) {
            setLocalValues({});
            wizard.reset();
          }
          for (const id of refreshWidgetIds) {
            queryClient.invalidateQueries({ queryKey: ["widget-query", id] });
          }
        },
        onError: (err) => {
          setErrorMessage(err.message);
        },
      },
    );
  }, [
    fields,
    localValues,
    connectionId,
    query,
    chartOptions,
    writeQuery,
    refreshWidgetIds,
    queryClient,
  ]);

  if (fields.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-4 text-center">
        <p className="text-sm text-muted-foreground">
          No fields configured. Add fields in the widget editor to build your
          form.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (readOnly) return;
          handleSubmit();
        }}
        className="space-y-4 p-4"
      >
        {readOnly && (
          <div
            role="status"
            data-testid="form-readonly-banner"
            className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
          >
            <span aria-hidden="true">⚠</span>
            <span>
              You don&rsquo;t have permission to submit this form. Contact an
              administrator if you need write access.
            </span>
          </div>
        )}

        {/* Step indicator for wizard forms */}
        {wizard.isWizard && (
          <FormStepIndicator
            stepLabels={wizard.stepLabels}
            currentStep={wizard.currentStep}
            onStepClick={wizard.goToStep}
          />
        )}

        {/* Field container — inert when read-only */}
        <div
          aria-disabled={readOnly}
          className={
            readOnly
              ? "pointer-events-none select-none space-y-4 opacity-60"
              : "space-y-4"
          }
        >
          {wizard.isSummaryStep ? (
            /* Summary step: show all values read-only */
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">
                Review your entries before submitting
              </h3>
              {fields.map((field) => (
                <div key={field.id} className="space-y-0.5">
                  <p className="text-xs text-muted-foreground">
                    {field.label || field.parameterName}
                  </p>
                  <p className="text-sm font-medium">
                    {formatSummaryValue(
                      localValues[field.parameterName],
                      field,
                    )}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            /* Regular step: render field inputs */
            wizard.currentFields.map((field) => (
              <div
                key={field.id}
                className="space-y-1.5"
                onBlur={() => handleFieldBlur(field)}
              >
                <Label htmlFor={`form-field-${field.parameterName}`}>
                  {field.label || field.parameterName}
                  {field.required && (
                    <span className="text-destructive ml-0.5">*</span>
                  )}
                </Label>
                <FieldInput
                  field={field}
                  value={localValues[field.parameterName]}
                  onChange={handleFieldChange}
                  connectionId={connectionId}
                  tenantId={tenantId}
                  localValues={localValues}
                />
                {fieldErrors[field.parameterName] && (
                  <p className="text-xs text-destructive">
                    {fieldErrors[field.parameterName]}
                  </p>
                )}
              </div>
            ))
          )}
        </div>

        {successMessage && (
          <p className="text-sm text-green-600">{successMessage}</p>
        )}
        {errorMessage && (
          <p className="text-sm text-destructive">{errorMessage}</p>
        )}

        {/* Navigation buttons */}
        {wizard.isWizard ? (
          <div className="flex gap-2">
            {wizard.currentStep > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={wizard.goBack}
                className="flex-1"
              >
                Back
              </Button>
            )}
            {wizard.isSummaryStep || wizard.isLastStep ? (
              <Button
                type="submit"
                disabled={
                  readOnly ||
                  writeQuery.isPending ||
                  Object.keys(fieldErrors).length > 0
                }
                className="flex-1"
              >
                {writeQuery.isPending
                  ? "Submitting…"
                  : (chartOptions.submitButtonText as string) || "Submit"}
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => {
                  const errors = wizard.goNext(localValues);
                  if (errors) setFieldErrors(errors);
                }}
                className="flex-1"
              >
                Next
              </Button>
            )}
          </div>
        ) : (
          <Button
            type="submit"
            disabled={
              readOnly ||
              writeQuery.isPending ||
              Object.keys(fieldErrors).length > 0
            }
            title={
              readOnly
                ? "You don't have permission to submit this form"
                : undefined
            }
            className="w-full"
          >
            {writeQuery.isPending
              ? "Submitting…"
              : (chartOptions.submitButtonText as string) || "Submit"}
          </Button>
        )}
      </form>
    </div>
  );
}
