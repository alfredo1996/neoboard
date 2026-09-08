/**
 * ParamNumberRange — render tests for the wrapper's own contract (#1629).
 *
 * The sibling param-number-range.test.ts drives the store directly and passes
 * even if this component is deleted. This file renders ParamNumberRange with a
 * stubbed NumberRangeSlider and pins the two things only the wrapper does:
 *
 *  1. READ: the raw store value -> [number, number] | null under three guards
 *     (Array.isArray, length >= 2, Number.isFinite on both). null is the
 *     slider's "no selection" state — anything else silently un-selects.
 *  2. WRITE: onChange -> set(tuple) + setCompanion("min"|"max", n, "text"),
 *     onClear -> clear() + clearCompanion("min"|"max"). The literal "text"
 *     companion type is load-bearing: coerceValue rejects scalars typed
 *     "number-range", so $param_x_min would silently stop existing.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import type { ParameterEntry, ParameterType } from "@/stores/parameter-store";
import type { ParamActions } from "../use-param-actions";

/* ---------- mocks (declared before imports) ---------- */

const numberRangeProps: Array<Record<string, unknown>> = [];

vi.mock("@neoboard/components", () => ({
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
        <button
          data-testid={`nrs-clear-${p.parameterName}`}
          onClick={() => (p.onClear as () => void)()}
        >
          clear
        </button>
      </div>
    );
  },
}));

/* ---------- import under test ---------- */
import { ParamNumberRange } from "../param-number-range";

/** Pass `{ value }` for a stored entry; omit entirely for "no entry". */
function makeActions(stored?: { value: unknown }): ParamActions & {
  set: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
  setCompanion: ReturnType<typeof vi.fn>;
  clearCompanion: ReturnType<typeof vi.fn>;
} {
  const currentEntry: ParameterEntry | undefined = stored && {
    value: stored.value,
    source: "Parameter Selector",
    field: "price",
    type: "number-range",
    sourceType: "selector-widget",
  };
  return {
    set: vi.fn<(value: unknown) => void>(),
    clear: vi.fn<() => void>(),
    setCompanion:
      vi.fn<(suffix: string, value: unknown, type: ParameterType) => void>(),
    clearCompanion: vi.fn<(suffix: string) => void>(),
    currentEntry,
  };
}

function renderRange(
  actions: ParamActions,
  overrides: Partial<{
    rangeMin: number;
    rangeMax: number;
    rangeStep: number;
    className: string;
  }> = {},
) {
  render(
    <ParamNumberRange
      parameterName="price"
      actions={actions}
      rangeMin={overrides.rangeMin ?? 0}
      rangeMax={overrides.rangeMax ?? 100}
      rangeStep={overrides.rangeStep ?? 1}
      className={overrides.className}
    />,
  );
  return numberRangeProps[numberRangeProps.length - 1];
}

beforeEach(() => {
  vi.clearAllMocks();
  numberRangeProps.length = 0;
});

describe("ParamNumberRange — reading the stored value", () => {
  it("converts a string tuple restored from storage into real numbers", () => {
    const props = renderRange(makeActions({ value: ["10", "20"] }));
    expect(props.value).toEqual([10, 20]);
    const [lo, hi] = props.value as [number, number];
    expect(typeof lo).toBe("number");
    expect(typeof hi).toBe("number");
  });

  it("passes a numeric tuple through unchanged", () => {
    expect(renderRange(makeActions({ value: [1.5, 9] })).value).toEqual([
      1.5, 9,
    ]);
  });

  it("keeps the first two entries of an over-long tuple", () => {
    expect(renderRange(makeActions({ value: [1, 2, 3] })).value).toEqual([
      1, 2,
    ]);
  });

  it.each([
    ["no entry at all", undefined, true],
    ["a non-finite member", ["a", 2], false],
    ["a tuple shorter than two", [5], false],
    ["a comma string", "10,20", false],
    ["a bare number", 42, false],
    ["null", null, false],
  ] as const)("yields null for %s", (_label, value, noEntry) => {
    const actions = noEntry ? makeActions() : makeActions({ value });
    expect(renderRange(actions).value).toBeNull();
  });
});

describe("ParamNumberRange — writing back", () => {
  it("sets the tuple and both scalar companions typed 'text'", () => {
    const actions = makeActions();
    renderRange(actions);
    fireEvent.click(screen.getByTestId("nrs-change-price"));

    expect(actions.set).toHaveBeenCalledWith([10, 20]);
    expect(actions.setCompanion).toHaveBeenCalledWith("min", 10, "text");
    expect(actions.setCompanion).toHaveBeenCalledWith("max", 20, "text");
    expect(actions.clear).not.toHaveBeenCalled();
    expect(actions.clearCompanion).not.toHaveBeenCalled();
  });

  it("clears the tuple and both companions on onClear, without setting", () => {
    const actions = makeActions({ value: [10, 20] });
    renderRange(actions);
    fireEvent.click(screen.getByTestId("nrs-clear-price"));

    expect(actions.clear).toHaveBeenCalledTimes(1);
    expect(actions.clearCompanion).toHaveBeenCalledWith("min");
    expect(actions.clearCompanion).toHaveBeenCalledWith("max");
    expect(actions.set).not.toHaveBeenCalled();
    expect(actions.setCompanion).not.toHaveBeenCalled();
  });
});

describe("ParamNumberRange — forwarded props", () => {
  it("forwards range bounds, step, className and hardcodes showInputs", () => {
    const props = renderRange(makeActions(), {
      rangeMin: 5,
      rangeMax: 500,
      rangeStep: 10,
      className: "w-full",
    });
    expect(props.parameterName).toBe("price");
    expect(props.min).toBe(5);
    expect(props.max).toBe(500);
    expect(props.step).toBe(10);
    expect(props.className).toBe("w-full");
    expect(props.showInputs).toBe(true);
  });
});
