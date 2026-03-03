"use client";

import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
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
import { useWriteQueryExecution } from "@/hooks/use-write-query-execution";
import { useSeedQuery } from "@/hooks/use-seed-query";
import { buildFormParams } from "@/lib/form-field-def";
import type { FormFieldDef } from "@/lib/form-field-def";
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

  const needsSeed =
    field.parameterType === "select" ||
    field.parameterType === "multi-select" ||
    field.parameterType === "cascading-select";

  const cascadingEnabled =
    field.parameterType !== "cascading-select" ||
    (field.parentParameterName !== undefined ? !!parentValue : true);

  const seedExtraParams = useMemo(() => {
    const base =
      field.parameterType === "cascading-select" ? parentParams : {};
    if (field.searchable && debouncedSearch) {
      return { ...base, param_search: debouncedSearch };
    }
    return Object.keys(base).length > 0 ? base : undefined;
  }, [field.parameterType, field.searchable, parentParams, debouncedSearch]);

  const { options, loading } = useSeedQuery(
    connectionId,
    field.seedQuery,
    needsSeed && cascadingEnabled,
    seedExtraParams,
    tenantId,
  );

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
  }, [field.parameterType, field.parentParameterName, parentValue, field.parameterName, onChange]);

  switch (field.parameterType) {
    case "text": {
      const textValue = value !== undefined && value !== null ? String(value) : "";
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
      const selectValue = value !== undefined && value !== null ? String(value) : "";
      return (
        <ParamSelector
          parameterName={field.parameterName}
          options={options}
          value={selectValue}
          onChange={(v) => {
            if (!v) { onChange(field.parameterName, undefined); return; }
            const opt = options.find((o) => o.value === v);
            onChange(field.parameterName, opt?.rawValue !== undefined ? opt.rawValue : v);
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
            if (vals.length === 0) { onChange(field.parameterName, undefined); return; }
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
      const dateValue = value !== undefined && value !== null ? String(value) : "";
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
            if (!from && !to) { onChange(field.parameterName, undefined); return; }
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
            if (!v) { onChange(field.parameterName, undefined); return; }
            const opt = options.find((o) => o.value === v);
            onChange(field.parameterName, opt?.rawValue !== undefined ? opt.rawValue : v);
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

  // Sync local values when fields change (field added/removed/renamed in editor).
  // number-range fields default to [rangeMin, rangeMax] so buildFormParams always
  // includes param_X_min / param_X_max even when the user hasn't moved the slider.
  const fieldKey = fields.map((f) => f.parameterName).join(",");
  useEffect(() => {
    setLocalValues((prev) => {
      const next: Record<string, unknown> = {};
      for (const f of fields) {
        if (prev[f.parameterName] !== undefined) {
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
  }, [fieldKey]);

  const handleFieldChange = useCallback((name: string, value: unknown) => {
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

  const writeQuery = useWriteQueryExecution();

  const handleSubmit = useCallback(() => {
    setSuccessMessage(null);
    setErrorMessage(null);

    // Validate required fields
    const errors: Record<string, string> = {};
    for (const field of fields) {
      if (field.required) {
        const v = localValues[field.parameterName];
        let isEmpty = v === undefined || v === null || v === "";
        if (!isEmpty && Array.isArray(v)) isEmpty = v.length === 0;
        if (!isEmpty && field.parameterType === "date-range") {
          const r = v as { from?: string; to?: string } | undefined;
          isEmpty = !r?.from && !r?.to;
        }
        if (isEmpty) {
          errors[field.parameterName] = "This field is required";
        }
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
  }, [fields, localValues, connectionId, query, chartOptions, writeQuery, refreshWidgetIds, queryClient]);

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
          handleSubmit();
        }}
        className="space-y-4 p-4"
      >
        {fields.map((field) => (
          <div key={field.id} className="space-y-1.5">
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
        ))}

        {successMessage && (
          <p className="text-sm text-green-600">{successMessage}</p>
        )}
        {errorMessage && (
          <p className="text-sm text-destructive">{errorMessage}</p>
        )}

        <Button
          type="submit"
          disabled={writeQuery.isPending}
          className="w-full"
        >
          {writeQuery.isPending
            ? "Submitting…"
            : ((chartOptions.submitButtonText as string) || "Submit")}
        </Button>
      </form>
    </div>
  );
}
