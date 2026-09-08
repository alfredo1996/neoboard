/**
 * ParamDateRelative — render tests for the wrapper itself (#1629).
 *
 * The wrapper is two lines and both are silent when broken:
 *  - read: `currentEntry.value as RelativeDatePreset | ""` — no entry must
 *    become "" so DateRelativePicker renders "nothing selected" instead of
 *    going uncontrolled.
 *  - write: `if (!preset) { clear(); return; } set(preset)` — the picker
 *    toggles OFF by calling onChange(""), so dropping the early return writes
 *    "" as a live parameter that still substitutes into every query.
 *
 * Assertions are on what the COMPONENT hands the widget and on the ParamActions
 * spies it is given — not on the store, which the sibling suite already covers.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import type { ParameterEntry } from "@/stores/parameter-store";

/* ---------- mocks (declared before imports) ---------- */

const dateRelativeProps: Array<Record<string, unknown>> = [];

vi.mock("@neoboard/components", () => ({
  DateRelativePicker: (p: Record<string, unknown>) => {
    dateRelativeProps.push(p);
    return (
      <div data-testid={`date-relative-${p.parameterName}`}>
        <button
          data-testid={`rel-select-${p.parameterName}`}
          onClick={() => (p.onChange as (v: string) => void)("last_7_days")}
        >
          select
        </button>
        <button
          data-testid={`rel-toggle-off-${p.parameterName}`}
          onClick={() => (p.onChange as (v: string) => void)("")}
        >
          toggle off
        </button>
      </div>
    );
  },
}));

/* ---------- import under test ---------- */
import { ParamDateRelative } from "../param-date-relative";

function makeActions() {
  return {
    set: vi.fn(),
    clear: vi.fn(),
    setCompanion: vi.fn(),
    clearCompanion: vi.fn(),
    currentEntry: undefined as ParameterEntry | undefined,
  };
}

function entry(value: unknown): ParameterEntry {
  return {
    value,
    source: "Parameter Selector",
    field: "window",
    type: "date-relative",
    sourceType: "selector-widget",
  };
}

let actions: ReturnType<typeof makeActions>;

beforeEach(() => {
  vi.clearAllMocks();
  dateRelativeProps.length = 0;
  actions = makeActions();
});

function renderWrapper(className?: string) {
  return render(
    <ParamDateRelative
      parameterName="window"
      actions={actions}
      className={className}
    />,
  );
}

function lastProps() {
  return dateRelativeProps[dateRelativeProps.length - 1];
}

describe("ParamDateRelative — read path", () => {
  it("passes '' to the picker when no entry is set", () => {
    renderWrapper();
    expect(screen.getByTestId("date-relative-window")).toBeInTheDocument();
    expect(lastProps().value).toBe("");
  });

  it("passes the stored preset key through unchanged", () => {
    actions.currentEntry = entry("last_7_days");
    renderWrapper();
    expect(lastProps().value).toBe("last_7_days");
  });

  it("forwards parameterName and className to the picker", () => {
    renderWrapper("my-class");
    expect(lastProps().parameterName).toBe("window");
    expect(lastProps().className).toBe("my-class");
  });
});

describe("ParamDateRelative — write path", () => {
  it("sets the parameter when a preset is selected", () => {
    renderWrapper();
    fireEvent.click(screen.getByTestId("rel-select-window"));
    expect(actions.set).toHaveBeenCalledTimes(1);
    expect(actions.set).toHaveBeenCalledWith("last_7_days");
    expect(actions.clear).not.toHaveBeenCalled();
  });

  it("clears — never sets '' — when the active preset is toggled off", () => {
    actions.currentEntry = entry("last_7_days");
    renderWrapper();
    fireEvent.click(screen.getByTestId("rel-toggle-off-window"));
    expect(actions.clear).toHaveBeenCalledTimes(1);
    expect(actions.set).not.toHaveBeenCalled();
  });
});
