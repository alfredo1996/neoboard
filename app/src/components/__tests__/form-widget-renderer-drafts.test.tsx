/**
 * FormWidgetRenderer — a text draft still inside DebouncedTextInput's 200 ms
 * window when the field blurs or the form submits (#1771).
 *
 * The other renderer suites mock DebouncedTextInput with a pass-through input,
 * so onChange there is instant. This suite keeps the real debounce under fake
 * timers and never advances them past it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  act,
  configure,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import type { FormFieldDef } from "@/lib/widget/form-field-def";

// RTL's default asyncWrapper drains with a setTimeout(0) it only advances under
// Jest, so every user-event call would hang on vitest's fake clock. Each event
// user-event dispatches is still wrapped in act.
configure({ asyncWrapper: (cb) => cb() });

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
    id,
  }: {
    parameterName: string;
    value: string;
    onChange: (v: string) => void;
    id?: string;
  }) => (
    <input
      id={id}
      type="text"
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

function textField(parameterName: string, required = true): FormFieldDef {
  return {
    id: `f-${parameterName}`,
    label: parameterName,
    parameterName,
    parameterType: "text",
    required,
  } as FormFieldDef;
}

function renderForm(fields: FormFieldDef[]) {
  render(
    <FormWidgetRenderer
      connectionId="conn-1"
      query="CREATE (n {name: $param_name})"
      settings={{ formFields: fields }}
    />,
  );
}

const input = (name: string) => screen.getByTestId(`input-${name}`);
const submitButton = () =>
  screen.getByRole("button", { name: "Submit" }) as HTMLButtonElement;
const submittedParams = (call = 0) => mockMutate.mock.calls[call][0].params;

/** Make the next submit fail the way a NOT NULL violation on `column` does. */
function failOnColumn(column: string) {
  mockMutate.mockImplementationOnce(
    (_p: unknown, opts: { onError: (e: Error) => void }) =>
      opts.onError(
        Object.assign(new Error(`The field "${column}" is required.`), {
          details: { column },
        }),
      ),
  );
}

beforeEach(() => {
  mockMutate.mockReset();
  // Never advanced past 200 ms: every assertion runs inside the debounce.
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("FormWidgetRenderer — text draft inside the debounce window (#1771)", () => {
  it("does not flag a typed required field as empty when it blurs", () => {
    renderForm([textField("name")]);
    fireEvent.change(input("name"), { target: { value: "Ada Lovelace" } });
    fireEvent.blur(input("name"));
    expect(screen.queryByText(REQUIRED)).toBeNull();
  });

  it("still flags an empty required field when it blurs", () => {
    renderForm([textField("name")]);
    fireEvent.blur(input("name"));
    expect(screen.getByText(REQUIRED)).toBeInTheDocument();
  });

  it("submits the typed draft when Submit is clicked while the required error shows", () => {
    renderForm([textField("name")]);
    fireEvent.click(submitButton());
    expect(screen.getByText(REQUIRED)).toBeInTheDocument();

    fireEvent.change(input("name"), { target: { value: "Ada Lovelace" } });
    fireEvent.click(submitButton());

    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(submittedParams()).toEqual({ param_name: "Ada Lovelace" });
    expect(screen.queryByText(REQUIRED)).toBeNull();
  });

  it("keeps focus in the field while Submit is pressed", () => {
    // Taking focus on mousedown would blur the field, and its flushed draft
    // would clear the error line and move Submit before the mouseup landed.
    // jsdom has no layout; form-widget.spec.ts clicks a real button.
    renderForm([textField("name")]);
    expect(fireEvent.mouseDown(submitButton())).toBe(false);
  });

  it("submits the typed draft when Enter is pressed while the required error shows", async () => {
    const user = userEvent.setup({ delay: null });
    renderForm([textField("name")]);
    fireEvent.click(submitButton());
    expect(screen.getByText(REQUIRED)).toBeInTheDocument();

    await user.type(input("name"), "Ada{Enter}");

    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(submittedParams()).toEqual({ param_name: "Ada" });
    expect(screen.queryByText(REQUIRED)).toBeNull();
  });

  it("submits every field typed inside the window", () => {
    renderForm([textField("name"), textField("email")]);
    fireEvent.change(input("name"), { target: { value: "Ada" } });
    fireEvent.change(input("email"), { target: { value: "ada@example.com" } });
    fireEvent.click(submitButton());

    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(submittedParams()).toEqual({
      param_name: "Ada",
      param_email: "ada@example.com",
    });
  });

  it("maps a database error to the form, not to a field typed inside the window", () => {
    // Optional in the form, so only the database can reject it — and it was
    // filled, so a column match on it is a name coincidence (#1409).
    failOnColumn("name");
    renderForm([textField("name", false)]);
    fireEvent.change(input("name"), { target: { value: "Ada" } });
    fireEvent.click(submitButton());

    expect(submittedParams()).toEqual({ param_name: "Ada" });
    expect(
      screen.getByText('The field "name" is required.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(REQUIRED)).toBeNull();
    expect(submitButton().disabled).toBe(false);
  });

  it("lets Enter submit a draft typed into the field the database rejected", async () => {
    // The database error disables Submit until the field is edited (#1409);
    // Enter must count the draft as that edit before implicit submission.
    const user = userEvent.setup({ delay: null });
    failOnColumn("name");
    renderForm([textField("name", false)]);
    fireEvent.click(submitButton());
    expect(screen.getByText(REQUIRED)).toBeInTheDocument();
    expect(submitButton().disabled).toBe(true);

    await user.type(input("name"), "Ada{Enter}");

    expect(mockMutate).toHaveBeenCalledTimes(2);
    expect(submittedParams(1)).toEqual({ param_name: "Ada" });
  });

  it("reads the reset values on the next submit after success", () => {
    renderForm([textField("name")]);
    fireEvent.change(input("name"), { target: { value: "Ada Lovelace" } });
    fireEvent.click(submitButton());
    act(() => mockMutate.mock.calls[0][1].onSuccess());

    fireEvent.click(submitButton());
    expect(screen.getByText(REQUIRED)).toBeInTheDocument();
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });
});
