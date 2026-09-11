/**
 * FormWidgetRenderer — FieldInput branch coverage per parameterType.
 *
 * Covers: text, select (static + seed), multi-select, date, date-range,
 * date-relative, number-range, cascading-select, and the default (unknown
 * parameterType) fall-through. Also covers submit flow success/error,
 * empty-fields fast path, and submit-button states.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
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
        id={p.id as string}
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
        id={p.id as string}
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
        id={p.id as string}
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
        id={p.id as string}
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
        id={p.id as string}
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
      <div id={p.id as string} data-testid={`number-range-${p.parameterName}`}>
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
    id,
  }: {
    children: React.ReactNode;
    htmlFor?: string;
    id?: string;
  }) => (
    <label id={id} htmlFor={htmlFor}>
      {children}
    </label>
  ),
}));

vi.mock("@/components/debounced-text-input", () => ({
  DebouncedTextInput: ({
    parameterName,
    value,
    onChange,
    placeholder,
    id,
    labelledBy,
    required,
  }: {
    parameterName: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    id?: string;
    labelledBy?: string;
    required?: boolean;
  }) => (
    <input
      id={id}
      aria-labelledby={labelledBy}
      aria-required={required || undefined}
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

  // #1411: a seed that consumes $param_search is already filtered by the
  // server, so the combobox must render its rows as given.
  it("marks a searchable seed select that uses $param_search as server-filtered", () => {
    renderForm([
      makeField({
        id: "s",
        parameterName: "person",
        parameterType: "select",
        seedQuery:
          "MATCH (p) WHERE p.email STARTS WITH $param_search RETURN p.id AS value",
        searchable: true,
      }),
    ]);
    const last = paramSelectorProps[paramSelectorProps.length - 1];
    expect(last.serverFiltered).toBe(true);
  });

  it("keeps client filtering for static options even with a $param_search seed", () => {
    renderForm([
      makeField({
        id: "s",
        parameterName: "country",
        parameterType: "select",
        staticOptions: "US,UK",
        seedQuery: "RETURN $param_search AS value",
        searchable: true,
      }),
    ]);
    const last = paramSelectorProps[paramSelectorProps.length - 1];
    expect(last.serverFiltered).toBe(false);
  });

  it.each([
    ["RETURN $param_search AS value", true],
    ["MATCH (n) RETURN n.tag AS value", false],
  ])("forwards serverFiltered to a searchable multi-select (%s)", (seedQuery, expected) => {
    renderForm([
      makeField({
        id: "m",
        parameterName: "tags",
        parameterType: "multi-select",
        seedQuery,
        searchable: true,
      }),
    ]);
    const last = paramMultiProps[paramMultiProps.length - 1];
    expect(last.serverFiltered).toBe(expected);
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

/*
 * #1410 — the form owns each field's one label. jsdom cannot compute
 * accessible names, so these pin the wiring that produces them: one <label>
 * per field, its htmlFor on the widget's control id, and the widget told to
 * name that control from the label instead of rendering the parameter name.
 * Playwright checks the resulting names (form-widget.spec.ts).
 */
describe("FormWidgetRenderer — one label per field (#1410)", () => {
  const typed: Array<[FormFieldDef["parameterType"], () => unknown[]]> = [
    ["select", () => paramSelectorProps],
    ["multi-select", () => paramMultiProps],
    ["date", () => datePickerProps],
    ["date-range", () => dateRangeProps],
    ["date-relative", () => dateRelativeProps],
    ["number-range", () => numberRangeProps],
  ];

  it.each(typed)(
    "a %s field has one label, pointing at the control the widget names from it",
    (parameterType, captured) => {
      const { container } = renderForm([
        makeField({
          id: "f1",
          label: "Category",
          parameterName: "rf1_category",
          parameterType,
          staticOptions: "a,b",
        }),
      ]);
      const labels = container.querySelectorAll("label");
      expect(labels).toHaveLength(1);
      const label = labels[0];
      expect(label.textContent).toBe("Category");
      const props = captured().at(-1) as { id: string; labelledBy: string };
      expect(props.labelledBy).toBe(label.id);
      expect(props.id).toBeTruthy();
      // The widget puts `id` on a labelable control (the component tests
      // check `label.control` on the real widgets) — except date-relative,
      // whose id sits on a group of buttons, which no label may point at.
      expect(label.getAttribute("for")).toBe(
        parameterType === "date-relative" ? null : props.id,
      );
    },
  );

  it("a text field's label is the label of its input", () => {
    const { container } = renderForm([
      makeField({ label: "Comment", parameterName: "rf1_comment" }),
    ]);
    const label = container.querySelector("label")!;
    const input = screen.getByTestId("input-rf1_comment");
    expect(label.control).toBe(input);
    expect(input.getAttribute("aria-labelledby")).toBe(label.id);
  });

  it("gives every field its own ids, even two forms with the same field", () => {
    const field = makeField({ label: "Name", parameterName: "name" });
    const { container } = render(
      <>
        <FormWidgetRenderer
          connectionId="c"
          query="q"
          settings={{ formFields: [field] }}
        />
        <FormWidgetRenderer
          connectionId="c"
          query="q"
          settings={{ formFields: [field, { ...field, id: "f2" }] }}
        />
      </>,
    );
    const ids = [...container.querySelectorAll("label")].flatMap((l) => [
      l.id,
      l.htmlFor,
    ]);
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
    // No id is built from the field's own strings — they are author data.
    expect(ids.some((id) => id.includes("name"))).toBe(false);
  });

  it("marks the asterisk decorative, so the control's name is the label alone", () => {
    const { container } = renderForm([
      makeField({ label: "Name", required: true }),
    ]);
    const star = within(container.querySelector("label")!).getByText("*");
    expect(star.getAttribute("aria-hidden")).toBe("true");
  });

  it.each([
    ["text", () => screen.getByTestId("input-v").getAttribute("aria-required")],
    ["select", () => String(paramSelectorProps.at(-1)?.required)],
    ["cascading-select", () => String(paramSelectorProps.at(-1)?.required)],
    ["multi-select", () => String(paramMultiProps.at(-1)?.required)],
  ] as const)(
    "tells a required %s field's control it is required",
    (parameterType, read) => {
      renderForm([makeField({ parameterType, required: true })]);
      expect(read()).toBe("true");
    },
  );
});

/*
 * #1409 — the database, not the form, knows a column is NOT NULL. When the
 * write route names the blank column, the error belongs on that field.
 */
describe("FormWidgetRenderer — server field errors (#1409)", () => {
  const seeded = [
    makeField({
      id: "rf1-c",
      label: "Category",
      parameterName: "rf1_category",
    }),
    makeField({ id: "rf1-co", label: "Comment", parameterName: "rf1_comment" }),
  ];

  function failWith(details?: Record<string, unknown>) {
    mockMutate.mockImplementation(
      (_p: unknown, opts: { onError?: (e: Error) => void }) => {
        opts.onError?.(
          Object.assign(new Error('The field "category" is required.'), {
            details,
          }),
        );
      },
    );
  }

  const fieldOf = (container: HTMLElement, label: string) =>
    [...container.querySelectorAll("label")].find(
      (l) => l.textContent === label,
    )!.parentElement!;

  it("puts a NOT NULL column error on the field that feeds the column", () => {
    failWith({ column: "category" });
    const { container } = renderForm(seeded);
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(
      within(fieldOf(container, "Category")).getByText(
        "This field is required",
      ),
    ).toBeInTheDocument();
    expect(
      within(fieldOf(container, "Comment")).queryByText(
        "This field is required",
      ),
    ).toBeNull();
    // On the field instead of at the bottom of the form, not as well as.
    expect(screen.queryByText('The field "category" is required.')).toBeNull();
  });

  it("keeps the field error when the still-blank field loses focus", () => {
    failWith({ column: "category" });
    const { container } = renderForm(seeded);
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    fireEvent.blur(screen.getByTestId("input-rf1_category"));
    expect(
      within(fieldOf(container, "Category")).getByText(
        "This field is required",
      ),
    ).toBeInTheDocument();
  });

  it("keeps the form-level message when the column matches a filled field", () => {
    // Label "Name" matches column "name", but that field has a value — the
    // blank one is fed by a parameter named unlike the column.
    failWith({ column: "name" });
    const { container } = renderForm([
      makeField({ id: "a", label: "Name", parameterName: "nickname" }),
      makeField({ id: "b", label: "Full name", parameterName: "full_name" }),
    ]);
    fireEvent.change(screen.getByTestId("input-nickname"), {
      target: { value: "Al" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(
      screen.getByText('The field "category" is required.'),
    ).toBeInTheDocument();
    expect(within(container).queryByText("This field is required")).toBeNull();
    expect(
      (screen.getByRole("button", { name: "Submit" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("clears the field error once the user fills the field", () => {
    failWith({ column: "category" });
    renderForm(seeded);
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    fireEvent.change(screen.getByTestId("input-rf1_category"), {
      target: { value: "shipping" },
    });
    expect(screen.queryByText("This field is required")).toBeNull();
  });

  it.each([
    ["no field matches the column", { column: "submitted_at" }],
    ["the error names no column", undefined],
  ])("falls back to the form-level message when %s", (_case, details) => {
    failWith(details);
    renderForm(seeded);
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(
      screen.getByText('The field "category" is required.'),
    ).toBeInTheDocument();
    expect(screen.queryByText("This field is required")).toBeNull();
  });
});
