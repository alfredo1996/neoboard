/**
 * ParamDateRange — render tests for the wrapper's OWN contract (#1629).
 *
 * Deliberately asserts on what the component does, not on what the store
 * does when called directly: the read coercion (absent entry, half-open
 * range, legacy string-typed entry all degrade to "" rather than reaching
 * DateRangeParameter's ISO parse as undefined), and the three-branch write
 * fan-out onto four store keys. The companion type "date" is load-bearing —
 * pass "date-range" there and coerceValue rejects the scalar, so
 * $param_x_from silently stops existing while $param_x keeps working.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { useParameterStore } from "@/stores/parameter-store";
import type { ParameterEntry } from "@/stores/parameter-store";
import { useParamActions } from "../use-param-actions";

/* ---------- mocks (declared before the import under test) ---------- */

const dateRangeProps: Array<Record<string, unknown>> = [];

vi.mock("@neoboard/components", () => ({
  DateRangeParameter: (p: Record<string, unknown>) => {
    dateRangeProps.push(p);
    const fire = (from: string, to: string) => () =>
      (p.onChange as (f: string, t: string) => void)(from, to);
    return (
      <div data-testid={`date-range-${p.parameterName}`}>
        <button
          data-testid="dr-both"
          onClick={fire("2026-01-01", "2026-01-31")}
        >
          both
        </button>
        <button data-testid="dr-from-only" onClick={fire("2026-01-01", "")}>
          from only
        </button>
        <button data-testid="dr-to-only" onClick={fire("", "2026-01-31")}>
          to only
        </button>
        <button data-testid="dr-empty" onClick={fire("", "")}>
          clear
        </button>
      </div>
    );
  },
}));

/* ---------- import under test ---------- */
import { ParamDateRange } from "../param-date-range";

function makeActions(currentEntry?: ParameterEntry) {
  return {
    set: vi.fn(),
    clear: vi.fn(),
    setCompanion: vi.fn(),
    clearCompanion: vi.fn(),
    currentEntry,
  };
}

function entry(value: unknown): ParameterEntry {
  return {
    value,
    source: "Parameter Selector",
    field: "period",
    type: "date-range",
    sourceType: "selector-widget",
  };
}

function lastProps() {
  return dateRangeProps[dateRangeProps.length - 1];
}

beforeEach(() => {
  vi.clearAllMocks();
  dateRangeProps.length = 0;
  useParameterStore.getState().clearAll();
});

describe("ParamDateRange — reading the stored entry", () => {
  it("renders empty bounds when no parameter is set", () => {
    render(<ParamDateRange parameterName="period" actions={makeActions()} />);

    expect(screen.getByTestId("date-range-period")).toBeInTheDocument();
    expect(lastProps().from).toBe("");
    expect(lastProps().to).toBe("");
  });

  it("passes both bounds through when a full range is stored", () => {
    render(
      <ParamDateRange
        parameterName="period"
        actions={makeActions(entry({ from: "2026-01-01", to: "2026-01-31" }))}
      />,
    );

    expect(lastProps().from).toBe("2026-01-01");
    expect(lastProps().to).toBe("2026-01-31");
  });

  it("degrades a half-open range to an empty string on the missing bound", () => {
    render(
      <ParamDateRange
        parameterName="period"
        actions={makeActions(entry({ from: "2026-01-01" }))}
      />,
    );

    expect(lastProps().from).toBe("2026-01-01");
    expect(lastProps().to).toBe("");
  });

  it("degrades a legacy string-typed entry to empty bounds", () => {
    // coerceValue also accepts a bare string for "date-range", so this shape
    // really can be in the store; it must not reach the child as undefined.
    render(
      <ParamDateRange
        parameterName="period"
        actions={makeActions(entry("2026-01-01"))}
      />,
    );

    expect(lastProps().from).toBe("");
    expect(lastProps().to).toBe("");
  });

  it("forwards parameterName and className to the widget", () => {
    render(
      <ParamDateRange
        parameterName="period"
        actions={makeActions()}
        className="w-64"
      />,
    );

    expect(lastProps().parameterName).toBe("period");
    expect(lastProps().className).toBe("w-64");
  });
});

describe("ParamDateRange — writing back", () => {
  it("sets the range object and both companions when both bounds are picked", () => {
    const actions = makeActions();
    render(<ParamDateRange parameterName="period" actions={actions} />);

    fireEvent.click(screen.getByTestId("dr-both"));

    expect(actions.set).toHaveBeenCalledWith({
      from: "2026-01-01",
      to: "2026-01-31",
    });
    // The "date" type is what keeps the scalar companions from being dropped.
    expect(actions.setCompanion).toHaveBeenCalledWith(
      "from",
      "2026-01-01",
      "date",
    );
    expect(actions.setCompanion).toHaveBeenCalledWith(
      "to",
      "2026-01-31",
      "date",
    );
    expect(actions.clear).not.toHaveBeenCalled();
    expect(actions.clearCompanion).not.toHaveBeenCalled();
  });

  it("still writes the full object and clears the 'to' companion for a from-only range", () => {
    const actions = makeActions();
    render(<ParamDateRange parameterName="period" actions={actions} />);

    fireEvent.click(screen.getByTestId("dr-from-only"));

    // Both keys must be strings or coerceValue silently drops the write.
    expect(actions.set).toHaveBeenCalledWith({ from: "2026-01-01", to: "" });
    expect(actions.setCompanion).toHaveBeenCalledTimes(1);
    expect(actions.setCompanion).toHaveBeenCalledWith(
      "from",
      "2026-01-01",
      "date",
    );
    expect(actions.clearCompanion).toHaveBeenCalledWith("to");
    expect(actions.clear).not.toHaveBeenCalled();
  });

  it("mirrors that for a to-only range", () => {
    const actions = makeActions();
    render(<ParamDateRange parameterName="period" actions={actions} />);

    fireEvent.click(screen.getByTestId("dr-to-only"));

    expect(actions.set).toHaveBeenCalledWith({ from: "", to: "2026-01-31" });
    expect(actions.setCompanion).toHaveBeenCalledTimes(1);
    expect(actions.setCompanion).toHaveBeenCalledWith(
      "to",
      "2026-01-31",
      "date",
    );
    expect(actions.clearCompanion).toHaveBeenCalledWith("from");
    expect(actions.clear).not.toHaveBeenCalled();
  });

  it("clears the parameter and both companions when both bounds go empty", () => {
    const actions = makeActions();
    render(<ParamDateRange parameterName="period" actions={actions} />);

    fireEvent.click(screen.getByTestId("dr-empty"));

    expect(actions.clear).toHaveBeenCalledTimes(1);
    expect(actions.clearCompanion).toHaveBeenCalledWith("from");
    expect(actions.clearCompanion).toHaveBeenCalledWith("to");
    // The early return: writing {from:"",to:""} would leave a live but empty
    // range parameter substituting into every query.
    expect(actions.set).not.toHaveBeenCalled();
    expect(actions.setCompanion).not.toHaveBeenCalled();
  });
});

/**
 * One end-to-end case against the real store: spy assertions cannot see a
 * coerceValue rejection, which is console.warn-only.
 */
function StoreHarness() {
  const actions = useParamActions("period", "date-range", "widget-1");
  return <ParamDateRange parameterName="period" actions={actions} />;
}

describe("ParamDateRange — against the real parameter store", () => {
  it("lands the range object plus 'date'-typed companions, then removes all three", () => {
    render(<StoreHarness />);

    fireEvent.click(screen.getByTestId("dr-both"));

    const params = useParameterStore.getState().parameters;
    expect(params["period"].value).toEqual({
      from: "2026-01-01",
      to: "2026-01-31",
    });
    expect(params["period_from"].value).toBe("2026-01-01");
    expect(params["period_from"].type).toBe("date");
    expect(params["period_to"].value).toBe("2026-01-31");
    expect(params["period_to"].type).toBe("date");

    fireEvent.click(screen.getByTestId("dr-empty"));

    const after = useParameterStore.getState().parameters;
    expect(after["period"]).toBeUndefined();
    expect(after["period_from"]).toBeUndefined();
    expect(after["period_to"]).toBeUndefined();
  });
});
