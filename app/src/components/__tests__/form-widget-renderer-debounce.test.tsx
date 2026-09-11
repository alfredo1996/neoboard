/**
 * FormWidgetRenderer — a text draft still inside DebouncedTextInput's 200 ms
 * window when the field blurs or the form submits (#1771).
 *
 * The other renderer suites mock DebouncedTextInput with a pass-through input,
 * so onChange there is instant. This suite keeps the real debounce under fake
 * timers and never advances them.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";
import type { FormFieldDef } from "@/lib/widget/form-field-def";

/* ---------- mocks (declared before imports) ---------- */

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { role: "admin", canWrite: true, tenantId: "t1" } },
  }),
}));

// TextInputParameter is what the real DebouncedTextInput renders.
vi.mock("@neoboard/components", () => ({
  TextInputParameter: ({
    parameterName,
    value,
    onChange,
  }: {
    parameterName: string;
    value: string;
    onChange: (v: string) => void;
  }) => (
    <input
      data-testid={`input-${parameterName}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
  Button: ({
    children,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...rest}>{children}</button>
  ),
  Label: ({ children }: { children: React.ReactNode }) => (
    <label>{children}</label>
  ),
}));

vi.mock("@/stores/parameter-store", () => ({
  useParameterValues: () => ({}),
}));

const mockMutate = vi.fn();
vi.mock("@/hooks/use-write-query-execution", () => ({
  useWriteQueryExecution: () => ({ mutate: mockMutate, isPending: false }),
}));

vi.mock("@/hooks/use-seed-query", () => ({
  useSeedQuery: () => ({ options: [], loading: false }),
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>(
    "@tanstack/react-query",
  );
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  };
});

/* ---------- import under test ---------- */
import { FormWidgetRenderer } from "../form-widget-renderer";

const REQUIRED = "This field is required";

function renderRequiredName() {
  const field = {
    id: "f1",
    label: "Full Name",
    parameterName: "name",
    parameterType: "text",
    required: true,
  } as FormFieldDef;
  render(
    <FormWidgetRenderer
      connectionId="conn-1"
      query="CREATE (n {name: $param_name})"
      settings={{ formFields: [field] }}
    />,
  );
  return screen.getByTestId("input-name");
}

beforeEach(() => {
  mockMutate.mockReset();
  // Never advanced: every assertion runs before the 200 ms debounce fires.
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("FormWidgetRenderer — text draft inside the debounce window (#1771)", () => {
  it("does not flag a typed required field as empty when it blurs", () => {
    const input = renderRequiredName();
    fireEvent.change(input, { target: { value: "Ada Lovelace" } });
    fireEvent.blur(input);
    expect(screen.queryByText(REQUIRED)).toBeNull();
  });

  it("still flags an empty required field when it blurs", () => {
    const input = renderRequiredName();
    fireEvent.blur(input);
    expect(screen.getByText(REQUIRED)).toBeTruthy();
  });

  it("submits the typed draft", () => {
    const input = renderRequiredName();
    fireEvent.change(input, { target: { value: "Ada Lovelace" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(screen.queryByText(REQUIRED)).toBeNull();
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate.mock.calls[0][0].params).toEqual({
      param_name: "Ada Lovelace",
    });
  });

  it("reads the reset values on the next submit after success", () => {
    const input = renderRequiredName();
    fireEvent.change(input, { target: { value: "Ada Lovelace" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    act(() => mockMutate.mock.calls[0][1].onSuccess());

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(screen.getByText(REQUIRED)).toBeTruthy();
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });
});
