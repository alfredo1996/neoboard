/**
 * ParamDate — the wrapper's own two-line contract (#1629).
 *
 * The sibling param-date.test.ts only drives the store directly and passes
 * even if this component is deleted. This file renders ParamDate and asserts
 * what IT does:
 *   1. read  — `String(currentEntry.value ?? "")`: DatePickerParameter parses
 *      `value` as an ISO YYYY-MM-DD string; a non-string (or a missing entry)
 *      leaking through silently breaks the calendar's selected state.
 *   2. write — `v ? actions.set(v) : actions.clear()`: the widget calls
 *      onChange("") both from its clear button and when a date is deselected,
 *      so the empty branch must DELETE the parameter, not write "".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import type { ParameterEntry } from "@/stores/parameter-store";
import type { ParamActions } from "../use-param-actions";

/* ---------- mocks (declared before the import under test) ---------- */

const datePickerProps: Array<Record<string, unknown>> = [];

vi.mock("@neoboard/components", () => ({
  DatePickerParameter: (p: Record<string, unknown>) => {
    datePickerProps.push(p);
    return (
      <div data-testid="date-picker">
        <button
          data-testid="pick"
          onClick={() => (p.onChange as (v: string) => void)("2026-01-01")}
        >
          pick
        </button>
        <button
          data-testid="deselect"
          onClick={() => (p.onChange as (v: string) => void)("")}
        >
          deselect
        </button>
      </div>
    );
  },
}));

/* ---------- import under test ---------- */
import { ParamDate } from "../param-date";

function makeActions(value?: unknown, hasEntry = true): ParamActions {
  const entry: ParameterEntry | undefined = hasEntry
    ? {
        value,
        source: "Parameter Selector",
        field: "d",
        type: "date",
        sourceType: "selector-widget",
      }
    : undefined;
  return {
    set: vi.fn(),
    clear: vi.fn(),
    setCompanion: vi.fn(),
    clearCompanion: vi.fn(),
    currentEntry: entry,
  };
}

function lastProps() {
  return datePickerProps[datePickerProps.length - 1];
}

beforeEach(() => {
  vi.clearAllMocks();
  datePickerProps.length = 0;
});

describe("ParamDate — read coercion", () => {
  it("passes '' when no parameter is set (never undefined)", () => {
    render(
      <ParamDate parameterName="d" actions={makeActions(undefined, false)} />,
    );
    expect(screen.getByTestId("date-picker")).toBeInTheDocument();
    expect(lastProps().value).toBe("");
  });

  it("passes a stored ISO string through unchanged", () => {
    render(<ParamDate parameterName="d" actions={makeActions("2026-01-01")} />);
    expect(lastProps().value).toBe("2026-01-01");
  });

  it("maps a null stored value to '' rather than the literal 'null'", () => {
    render(<ParamDate parameterName="d" actions={makeActions(null)} />);
    expect(lastProps().value).toBe("");
  });

  it("stringifies a non-string stored value (Date restored from a click action)", () => {
    render(
      <ParamDate
        parameterName="d"
        actions={makeActions(new Date("2026-01-01T00:00:00.000Z"))}
      />,
    );
    expect(typeof lastProps().value).toBe("string");
    expect(lastProps().value).toContain("2026");
  });

  it("forwards parameterName and className to the widget", () => {
    render(
      <ParamDate
        parameterName="eventDate"
        actions={makeActions("2026-01-01")}
        className="w-40"
      />,
    );
    expect(lastProps().parameterName).toBe("eventDate");
    expect(lastProps().className).toBe("w-40");
  });
});

describe("ParamDate — write routing", () => {
  it("sets the picked date and never clears", () => {
    const actions = makeActions(undefined, false);
    render(<ParamDate parameterName="d" actions={actions} />);
    fireEvent.click(screen.getByTestId("pick"));
    expect(actions.set).toHaveBeenCalledTimes(1);
    expect(actions.set).toHaveBeenCalledWith("2026-01-01");
    expect(actions.clear).not.toHaveBeenCalled();
  });

  it("clears — not sets '' — when the date is deselected", () => {
    const actions = makeActions("2026-01-01");
    render(<ParamDate parameterName="d" actions={actions} />);
    fireEvent.click(screen.getByTestId("deselect"));
    expect(actions.clear).toHaveBeenCalledTimes(1);
    expect(actions.set).not.toHaveBeenCalled();
  });
});
