/**
 * FormWidgetRenderer — FieldInput branch coverage per parameterType.
 *
 * Covers: text, select (static + seed), multi-select, date, date-range,
 * date-relative, number-range, cascading-select, and the default (unknown
 * parameterType) fall-through. Also covers submit flow success/error,
 * empty-fields fast path, and submit-button states.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import type { FormFieldDef } from "@/lib/widget/form-field-def";

/* ---------- mocks (declared before imports) ---------- */

const mockUseSession = vi.fn();
vi.mock("next-auth/react", () => ({
  useSession: (...args: unknown[]) => mockUseSession(...args),
}));

// Capture props passed to each component-library widget so assertions
// can inspect what the renderer handed them.
const paramSelectorProps: Array<Record<string, unknown>> = [];
const paramMultiProps: Array<Record<string, unknown>> = [];
const datePickerProps: Array<Record<string, unknown>> = [];
const dateRangeProps: Array<Record<string, unknown>> = [];
const dateRelativeProps: Array<Record<string, unknown>> = [];
const numberRangeProps: Array<Record<string, unknown>> = [];

vi.mock("@neoboard/components", () => ({
  ParamSelector: (p: Record<string, unknown>) => {
    paramSelectorProps.push(p);
    return (
      <button
        data-testid={`param-selector-${p.parameterName}`}
        onClick={() => (p.onChange as (v: string) => void)("ok")}
      >
        ParamSelector
      </button>
    );
  },
  ParamMultiSelector: (p: Record<string, unknown>) => {
    paramMultiProps.push(p);
    return (
      <button
        data-testid={`param-multi-${p.parameterName}`}
        onClick={() => (p.onChange as (v: string[]) => void)(["a", "b"])}
      >
        ParamMultiSelector
      </button>
    );
  },
  DatePickerParameter: (p: Record<string, unknown>) => {
    datePickerProps.push(p);
    return (
      <button
        data-testid={`date-picker-${p.parameterName}`}
        onClick={() => (p.onChange as (v: string) => void)("2026-01-01")}
      >
        DatePicker
      </button>
    );
  },
  DateRangeParameter: (p: Record<string, unknown>) => {
    dateRangeProps.push(p);
    return (
      <button
        data-testid={`date-range-${p.parameterName}`}
        onClick={() =>
          (p.onChange as (f: string, t: string) => void)(
            "2026-01-01",
            "2026-01-31",
          )
        }
      >
        DateRange
      </button>
    );
  },
  DateRelativePicker: (p: Record<string, unknown>) => {
    dateRelativeProps.push(p);
    return (
      <button
        data-testid={`date-relative-${p.parameterName}`}
        onClick={() => (p.onChange as (v: string) => void)("last_7_days")}
      >
        DateRelative
      </button>
    );
  },
  NumberRangeSlider: (p: Record<string, unknown>) => {
    numberRangeProps.push(p);
    return (
      <div data-testid={`number-range-${p.parameterName}`}>
        <button
          data-testid={`nrs-change-${p.parameterName}`}
          onClick={() =>
            (p.onChange as (v: [number, number]) => void)([10, 20])
          }
        >
          set
        </button>
      </div>
    );
  },
  Button: ({
    children,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...rest}>{children}</button>
  ),
  Label: ({
    children,
    htmlFor,
  }: {
    children: React.ReactNode;
    htmlFor?: string;
  }) => <label htmlFor={htmlFor}>{children}</label>,
}));

vi.mock("@/components/debounced-text-input", () => ({
  DebouncedTextInput: ({
    parameterName,
    value,
    onChange,
    placeholder,
  }: {
    parameterName: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
  }) => (
    <input
      aria-label={parameterName}
      data-testid={`input-${parameterName}`}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

vi.mock("@/stores/parameter-store", () => ({
  useParameterValues: () => ({}),
}));

const mockMutate = vi.fn();
let mutateIsPending = false;
vi.mock("@/hooks/use-write-query-execution", () => ({
  useWriteQueryExecution: () => ({
    mutate: mockMutate,
    get isPending() {
      return mutateIsPending;
    },
  }),
}));

vi.mock("@/hooks/use-seed-query", () => ({
  useSeedQuery: () => ({
    options: [{ value: "ok", label: "OK", rawValue: 42 }],
    loading: false,
  }),
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>(
    "@tanstack/react-query",
  );
  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: vi.fn(),
    }),
  };
});

/* ---------- import under test ---------- */
import { FormWidgetRenderer } from "../form-widget-renderer";

function makeField(overrides: Partial<FormFieldDef>): FormFieldDef {
  return {
    id: overrides.id ?? "f1",
    label: overrides.label ?? "Field",
    parameterName: overrides.parameterName ?? "v",
    parameterType: overrides.parameterType ?? "text",
    ...overrides,
  } as FormFieldDef;
}

function renderForm(
  fields: FormFieldDef[],
  settings: Record<string, unknown> = {},
) {
  return render(
    <FormWidgetRenderer
      connectionId="conn-1"
      query="CREATE (n) RETURN n"
      settings={{ formFields: fields, ...settings }}
    />,
  );
}

const ADMIN_SESSION = {
  data: { user: { role: "admin", canWrite: true, tenantId: "t1" } },
};

beforeEach(() => {
  vi.clearAllMocks();
  paramSelectorProps.length = 0;
  paramMultiProps.length = 0;
  datePickerProps.length = 0;
  dateRangeProps.length = 0;
  dateRelativeProps.length = 0;
  numberRangeProps.length = 0;
  mutateIsPending = false;
  mockUseSession.mockReturnValue(ADMIN_SESSION);
});

describe("FormWidgetRenderer — FieldInput per type", () => {
  it("renders a text input for parameterType='text'", () => {
    renderForm([
      makeField({
        id: "f1",
        parameterName: "name",
        parameterType: "text",
        placeholder: "type name",
      }),
    ]);
    const input = screen.getByTestId("input-name");
    expect(input).toBeDefined();
    expect((input as HTMLInputElement).placeholder).toBe("type name");
  });

  it("shows a required asterisk for required fields", () => {
    renderForm([
      makeField({
        id: "f1",
        label: "Name",
        parameterName: "name",
        parameterType: "text",
        required: true,
      }),
    ]);
    // the '*' is inside the Label element
    expect(screen.getByText("Name").textContent).toContain("*");
  });

  it("falls back to parameterName when label is empty", () => {
    renderForm([
      makeField({
        id: "f1",
        label: "",
        parameterName: "fallback",
        parameterType: "text",
      }),
    ]);
    // Label text = parameterName
    expect(screen.getByText("fallback")).toBeDefined();
  });

  it("renders ParamSelector for parameterType='select' with static options", () => {
    renderForm([
      makeField({
        id: "f1",
        parameterName: "choice",
        parameterType: "select",
        staticOptions: "low, medium, high",
      }),
    ]);
    expect(screen.getByTestId("param-selector-choice")).toBeDefined();
    // Static options parsed + trimmed
    const lastProps = paramSelectorProps[paramSelectorProps.length - 1];
    const opts = lastProps.options as Array<{
      value: string;
      rawValue: string;
    }>;
    expect(opts.map((o) => o.value)).toEqual(["low", "medium", "high"]);
  });

  it("renders ParamSelector for parameterType='select' with seed-driven options", () => {
    renderForm([
      makeField({
        id: "f1",
        parameterName: "choice",
        parameterType: "select",
        seedQuery: "MATCH (n) RETURN n.name AS value",
      }),
    ]);
    const lastProps = paramSelectorProps[paramSelectorProps.length - 1];
    const opts = lastProps.options as Array<{ value: string }>;
    expect(opts[0].value).toBe("ok");
  });

  it("ignores empty/whitespace-only staticOptions for select", () => {
    renderForm([
      makeField({
        id: "f1",
        parameterName: "choice",
        parameterType: "select",
        staticOptions: "   ",
        seedQuery: "MATCH (n) RETURN n.name AS value",
      }),
    ]);
    // With whitespace-only staticOptions, renderer uses seed options instead
    const lastProps = paramSelectorProps[paramSelectorProps.length - 1];
    const opts = lastProps.options as Array<{ value: string }>;
    expect(opts[0].value).toBe("ok");
  });

  it("renders ParamMultiSelector for parameterType='multi-select'", () => {
    renderForm([
      makeField({
        id: "f1",
        parameterName: "tags",
        parameterType: "multi-select",
        seedQuery: "MATCH (n) RETURN n.tag AS value",
      }),
    ]);
    expect(screen.getByTestId("param-multi-tags")).toBeDefined();
  });

  it("renders DatePickerParameter for parameterType='date'", () => {
    renderForm([
      makeField({
        id: "f1",
        parameterName: "d",
        parameterType: "date",
      }),
    ]);
    expect(screen.getByTestId("date-picker-d")).toBeDefined();
  });

  it("renders DateRangeParameter for parameterType='date-range'", () => {
    renderForm([
      makeField({
        id: "f1",
        parameterName: "range",
        parameterType: "date-range",
      }),
    ]);
    expect(screen.getByTestId("date-range-range")).toBeDefined();
    const lastProps = dateRangeProps[dateRangeProps.length - 1];
    expect(lastProps.from).toBe("");
    expect(lastProps.to).toBe("");
  });

  it("renders DateRelativePicker for parameterType='date-relative'", () => {
    renderForm([
      makeField({
        id: "f1",
        parameterName: "rel",
        parameterType: "date-relative",
      }),
    ]);
    expect(screen.getByTestId("date-relative-rel")).toBeDefined();
  });

  it("renders NumberRangeSlider with rangeMin/rangeMax/rangeStep defaults", () => {
    renderForm([
      makeField({
        id: "f1",
        parameterName: "amount",
        parameterType: "number-range",
      }),
    ]);
    const lastProps = numberRangeProps[numberRangeProps.length - 1];
    expect(lastProps.min).toBe(0);
    expect(lastProps.max).toBe(100);
    expect(lastProps.step).toBe(1);
  });

  it("honours custom rangeMin/rangeMax/rangeStep for number-range", () => {
    renderForm([
      makeField({
        id: "f1",
        parameterName: "score",
        parameterType: "number-range",
        rangeMin: 5,
        rangeMax: 500,
        rangeStep: 10,
      }),
    ]);
    const lastProps = numberRangeProps[numberRangeProps.length - 1];
    expect(lastProps.min).toBe(5);
    expect(lastProps.max).toBe(500);
    expect(lastProps.step).toBe(10);
  });

  // #1360: cascading form fields render the same ParamSelector as plain
  // selects, so they inherit its search input instead of being the one
  // control you cannot type into.
  it("renders a cascading field through ParamSelector, gated on its parent", () => {
    renderForm([
      makeField({
        id: "p",
        parameterName: "country",
        parameterType: "select",
        staticOptions: "US,UK",
      }),
      makeField({
        id: "c",
        parameterName: "city",
        parameterType: "cascading-select",
        parentParameterName: "country",
        seedQuery: "MATCH (n) RETURN n.city AS value",
        searchable: true,
      }),
    ]);
    expect(screen.getByTestId("param-selector-city")).toBeDefined();

    const cityProps = paramSelectorProps.filter(
      (p) => p.parameterName === "city",
    );
    const last = cityProps[cityProps.length - 1];
    expect(last.parentParameterName).toBe("country");
    // No parent value chosen yet — the gate is closed.
    expect(last.parentValue).toBe("");
    expect(last.searchable).toBe(true);
    expect(typeof last.onSearch).toBe("function");
  });

  it("passes a plain select's parentParameterName through as undefined", () => {
    renderForm([
      makeField({
        id: "p",
        parameterName: "country",
        parameterType: "select",
        staticOptions: "US,UK",
      }),
    ]);
    const last = paramSelectorProps[paramSelectorProps.length - 1];
    expect(last.parentParameterName).toBeUndefined();
    expect(last.parentValue).toBeUndefined();
  });

  it("returns null for unknown parameterType (default branch)", () => {
    renderForm([
      // Force an unknown parameterType to exercise the default case.
      makeField({
        id: "f1",
        parameterName: "weird",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        parameterType: "totally-unknown" as any,
      }),
    ]);
    // The label renders, but no known test-id widget is produced.
    expect(screen.getByText("Field")).toBeDefined();
    expect(screen.queryByTestId("input-weird")).toBeNull();
    expect(screen.queryByTestId("param-selector-weird")).toBeNull();
  });
});

describe("FormWidgetRenderer — empty state + submit flow", () => {
  it("renders empty-state when no fields are configured", () => {
    renderForm([]);
    expect(screen.getByText(/No fields configured/)).toBeDefined();
    expect(screen.queryByRole("button", { name: "Submit" })).toBeNull();
  });

  it("submits via writeQuery.mutate with buildFormParams output", () => {
    renderForm([
      makeField({
        id: "f1",
        parameterName: "v",
        parameterType: "text",
      }),
    ]);
    fireEvent.change(screen.getByTestId("input-v"), {
      target: { value: "hello" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(mockMutate).toHaveBeenCalledTimes(1);
    const [payload] = mockMutate.mock.calls[0];
    expect(payload.connectionId).toBe("conn-1");
    expect(payload.params).toEqual({ param_v: "hello" });
  });

  it("blocks submit when a required field has an invalid value", () => {
    renderForm([
      makeField({
        id: "f1",
        parameterName: "v",
        parameterType: "text",
        required: true,
      }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    // Validation should trip; mutate not called
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("shows a success message and resets on mutate success (default resetOnSuccess)", () => {
    mockMutate.mockImplementation(
      (
        _p: unknown,
        opts: { onSuccess?: () => void; onError?: (e: Error) => void },
      ) => {
        opts.onSuccess?.();
      },
    );
    renderForm([
      makeField({
        id: "f1",
        parameterName: "v",
        parameterType: "text",
      }),
    ]);
    fireEvent.change(screen.getByTestId("input-v"), {
      target: { value: "ok" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(
      screen.getByText(/Form submitted successfully/i),
    ).toBeInTheDocument();
  });

  it("uses chartOptions.successMessage when provided", () => {
    mockMutate.mockImplementation(
      (_p: unknown, opts: { onSuccess?: () => void }) => {
        opts.onSuccess?.();
      },
    );
    renderForm(
      [makeField({ id: "f1", parameterName: "v", parameterType: "text" })],
      { chartOptions: { successMessage: "Booked!" } },
    );
    fireEvent.change(screen.getByTestId("input-v"), {
      target: { value: "ok" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(screen.getByText("Booked!")).toBeInTheDocument();
  });

  it("shows the mutation error message on mutate failure", () => {
    mockMutate.mockImplementation(
      (_p: unknown, opts: { onError?: (e: Error) => void }) => {
        opts.onError?.(new Error("write failed"));
      },
    );
    renderForm([
      makeField({ id: "f1", parameterName: "v", parameterType: "text" }),
    ]);
    fireEvent.change(screen.getByTestId("input-v"), {
      target: { value: "x" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(screen.getByText("write failed")).toBeInTheDocument();
  });

  it("uses custom submitButtonText from chartOptions", () => {
    renderForm(
      [makeField({ id: "f1", parameterName: "v", parameterType: "text" })],
      { chartOptions: { submitButtonText: "Save record" } },
    );
    expect(screen.getByRole("button", { name: "Save record" })).toBeDefined();
  });

  it("shows 'Submitting…' while mutation is pending", () => {
    mutateIsPending = true;
    renderForm([
      makeField({ id: "f1", parameterName: "v", parameterType: "text" }),
    ]);
    const btn = screen.getByRole("button", {
      name: /Submitting/,
    }) as HTMLButtonElement;
    expect(btn).toBeDefined();
    expect(btn.disabled).toBe(true);
  });
});
