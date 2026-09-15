import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";

/* ---------- mocks (must be declared before imports) ---------- */

const mockUseSession = vi.fn();
vi.mock("next-auth/react", () => ({
  useSession: (...args: unknown[]) => mockUseSession(...args),
}));

// The dashboard route the form is on.
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "dash-1" }),
}));

// Stub component library — only the pieces FormWidgetRenderer imports.
vi.mock("@neoboard/components", () => ({
  ParamSelector: () => <div data-testid="param-selector" />,
  ParamMultiSelector: () => <div data-testid="param-multi-selector" />,
  DatePickerParameter: () => <div data-testid="date-picker" />,
  DateRangeParameter: () => <div data-testid="date-range" />,
  DateRelativePicker: () => <div data-testid="date-relative" />,
  NumberRangeSlider: () => <div data-testid="number-range" />,
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
    onChange,
  }: {
    parameterName: string;
    value: string;
    onChange: (v: string) => void;
  }) => (
    <input
      aria-label={parameterName}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      data-testid={`input-${parameterName}`}
    />
  ),
}));

vi.mock("@/stores/parameter-store", () => ({
  useParameterValues: () => ({}),
}));

const mockMutate = vi.fn();
vi.mock("@/hooks/use-write-query-execution", () => ({
  useWriteQueryExecution: () => ({
    mutate: mockMutate,
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
  widgetId: "w-form",
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

// Everyone who can open a dashboard can submit its forms, whatever their role
// or write permission, and the server runs each form as its dashboard saves it
// (#1831). So the form offers Submit to everyone who can see it.
describe("FormWidgetRenderer — anyone who can see a form can submit it (#1831)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["a reader", { role: "reader", canWrite: false }],
    [
      "a reader whose stored write flag is still on",
      { role: "reader", canWrite: true },
    ],
    [
      "a creator with write permission off",
      { role: "creator", canWrite: false },
    ],
    [
      "a viewer share user with write permission on",
      { role: "creator", canWrite: true },
    ],
    ["an admin", { role: "admin", canWrite: true }],
  ])("lets %s submit, naming the stored form and its dashboard", (_, user) => {
    mockUseSession.mockReturnValue({
      data: { user: { ...user, tenantId: "t1" } },
    });

    render(<FormWidgetRenderer {...baseProps} />);

    expect(screen.queryByTestId("form-readonly-banner")).toBeNull();
    expect(screen.queryByText(/permission to submit/i)).toBeNull();
    const submit = screen.getByRole("button", { name: "Submit" });
    expect(submit).toBeEnabled();
    expect(submit).not.toHaveAttribute("title");
    fireEvent.change(screen.getByTestId("input-v"), {
      target: { value: "hello" },
    });
    fireEvent.click(submit);

    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate.mock.calls[0][0]).toEqual({
      connectionId: "conn-1",
      query: baseProps.query,
      params: { param_v: "hello" },
      widgetId: "w-form",
      dashboardId: "dash-1",
    });
  });

  it("offers Submit while the session is still loading", () => {
    mockUseSession.mockReturnValue({ data: undefined });

    render(<FormWidgetRenderer {...baseProps} />);

    expect(screen.queryByTestId("form-readonly-banner")).toBeNull();
    expect(screen.getByRole("button", { name: "Submit" })).toBeEnabled();
  });

  it("renders empty-state when no fields are configured (no session check)", () => {
    mockUseSession.mockReturnValue({
      data: { user: { role: "admin", canWrite: true, tenantId: "t1" } },
    });

    render(<FormWidgetRenderer {...baseProps} settings={{ formFields: [] }} />);

    expect(screen.getByText(/No fields configured/)).toBeDefined();
  });
});
