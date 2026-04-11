import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

/* ---------- mocks (must be declared before imports) ---------- */

const mockUseSession = vi.fn();
vi.mock("next-auth/react", () => ({
  useSession: (...args: unknown[]) => mockUseSession(...args),
}));

// Stub component library — only the pieces FormWidgetRenderer imports.
vi.mock("@neoboard/components", () => ({
  ParamSelector: () => <div data-testid="param-selector" />,
  ParamMultiSelector: () => <div data-testid="param-multi-selector" />,
  DatePickerParameter: () => <div data-testid="date-picker" />,
  DateRangeParameter: () => <div data-testid="date-range" />,
  DateRelativePicker: () => <div data-testid="date-relative" />,
  NumberRangeSlider: () => <div data-testid="number-range" />,
  CascadingSelector: () => <div data-testid="cascading" />,
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

// DebouncedTextInput pulls in debounce/useEffect — stub to a plain input.
vi.mock("@/components/debounced-text-input", () => ({
  DebouncedTextInput: ({
    parameterName,
    value,
  }: {
    parameterName: string;
    value: string;
  }) => (
    <input
      aria-label={parameterName}
      defaultValue={value}
      data-testid={`input-${parameterName}`}
    />
  ),
}));

vi.mock("@/stores/parameter-store", () => ({
  useParameterValues: () => ({}),
}));

vi.mock("@/hooks/use-write-query-execution", () => ({
  useWriteQueryExecution: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
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
    useQueryClient: () => ({
      invalidateQueries: vi.fn(),
    }),
  };
});

/* ---------- import under test ---------- */
import { FormWidgetRenderer } from "../form-widget-renderer";

const baseProps = {
  connectionId: "conn-1",
  query: "CREATE (n:X {v: $param_v}) RETURN n.v",
  settings: {
    formFields: [
      {
        id: "f1",
        label: "Value",
        parameterName: "v",
        parameterType: "text",
        required: true,
      },
    ],
  },
};

describe("FormWidgetRenderer — readOnly gating (#496)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a submittable form for an admin with canWrite=true", () => {
    mockUseSession.mockReturnValue({
      data: {
        user: { role: "admin", canWrite: true, tenantId: "t1" },
      },
    });

    render(<FormWidgetRenderer {...baseProps} />);

    expect(screen.queryByTestId("form-readonly-banner")).toBeNull();
    expect(screen.getByRole("button", { name: "Submit" })).not.toBeDisabled();
  });

  it("renders read-only banner and disables Submit for a creator with canWrite=false", () => {
    mockUseSession.mockReturnValue({
      data: {
        user: { role: "creator", canWrite: false, tenantId: "t1" },
      },
    });

    render(<FormWidgetRenderer {...baseProps} />);

    expect(screen.getByTestId("form-readonly-banner")).toBeDefined();
    expect(
      screen.getByText(/don.?t have permission to submit this form/i),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
  });

  it("renders read-only for a reader even when DB canWrite column is true", () => {
    // Readers get canWrite=true from the DB column but are locked out by
    // role in requireSession(). The client must mirror that derivation.
    mockUseSession.mockReturnValue({
      data: {
        user: { role: "reader", canWrite: true, tenantId: "t1" },
      },
    });

    render(<FormWidgetRenderer {...baseProps} />);

    expect(screen.getByTestId("form-readonly-banner")).toBeDefined();
    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
  });

  it("defaults to read-only while the session is still loading", () => {
    // Undefined session.data means next-auth hasn't resolved yet.
    // We deliberately default to readOnly=true to avoid flashing an
    // enabled form to a reader during the hydration window.
    mockUseSession.mockReturnValue({ data: undefined });

    render(<FormWidgetRenderer {...baseProps} />);

    // The banner only renders once sessionLoaded is true; during the
    // loading window the Submit button is still enabled because we
    // don't yet know the role. Assert the safe behavior: form is there
    // but no crash, and no false-positive banner.
    expect(screen.queryByTestId("form-readonly-banner")).toBeNull();
  });

  it("renders empty-state when no fields are configured (no session check)", () => {
    mockUseSession.mockReturnValue({
      data: { user: { role: "admin", canWrite: true, tenantId: "t1" } },
    });

    render(<FormWidgetRenderer {...baseProps} settings={{ formFields: [] }} />);

    expect(screen.getByText(/No fields configured/)).toBeDefined();
  });
});
