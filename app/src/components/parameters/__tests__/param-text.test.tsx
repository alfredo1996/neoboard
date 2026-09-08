/**
 * ParamText — the wrapper's own two-line contract (#1629).
 *
 * ParamText delegates the 200 ms debounce and all UI to DebouncedTextInput, so
 * the only thing it owns is:
 *   (1) read coercion — `currentEntry ? String(currentEntry.value ?? "") : ""`,
 *       which keeps DebouncedTextInput controlled and stringifies a non-string
 *       stored value (a number restored from localStorage, a click-action entry)
 *       before it reaches a `value: string` prop;
 *   (2) empty-string routing — `v ? actions.set(v) : actions.clear()`, so
 *       clearing the field DELETES the parameter instead of leaving a live,
 *       empty one still substituting into every query.
 * Both are silent when broken, so they are asserted here directly.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import type { ParameterEntry } from "@/stores/parameter-store";
import type { ParamActions } from "../use-param-actions";

/* ---------- mocks (declared before imports) ---------- */

// Stand in for the debounce wrapper: fires onChange synchronously so the test
// exercises ParamText's routing rather than the timer inside DebouncedTextInput.
const debouncedProps: Array<Record<string, unknown>> = [];
vi.mock("@/components/debounced-text-input", () => ({
  DebouncedTextInput: (p: Record<string, unknown>) => {
    debouncedProps.push(p);
    return (
      <input
        data-testid={`input-${p.parameterName}`}
        value={p.value as string}
        placeholder={p.placeholder as string | undefined}
        className={p.className as string | undefined}
        onChange={(e) => (p.onChange as (v: string) => void)(e.target.value)}
      />
    );
  },
}));

/* ---------- import under test ---------- */
import { ParamText } from "../param-text";

function makeActions(currentEntry?: ParameterEntry): ParamActions {
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
    field: "city",
    type: "text",
    sourceType: "selector-widget",
  };
}

function lastProps() {
  return debouncedProps[debouncedProps.length - 1];
}

beforeEach(() => {
  vi.clearAllMocks();
  debouncedProps.length = 0;
});

describe("ParamText — read coercion", () => {
  it("renders an empty string when there is no entry (stays controlled)", () => {
    render(<ParamText parameterName="city" actions={makeActions()} />);
    expect(lastProps().value).toBe("");
    expect((screen.getByTestId("input-city") as HTMLInputElement).value).toBe(
      "",
    );
  });

  it("stringifies a non-string stored value", () => {
    render(<ParamText parameterName="city" actions={makeActions(entry(42))} />);
    expect(lastProps().value).toBe("42");
    expect(typeof lastProps().value).toBe("string");
  });

  it("passes a string value through unchanged", () => {
    render(
      <ParamText parameterName="city" actions={makeActions(entry("Berlin"))} />,
    );
    expect(lastProps().value).toBe("Berlin");
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
  ] as const)(
    "maps an entry holding %s to '' rather than the literal text",
    (_label, stored) => {
      render(
        <ParamText parameterName="city" actions={makeActions(entry(stored))} />,
      );
      expect(lastProps().value).toBe("");
    },
  );
});

describe("ParamText — write routing", () => {
  it("sets the parameter when the user types", () => {
    const actions = makeActions();
    render(<ParamText parameterName="city" actions={actions} />);
    fireEvent.change(screen.getByTestId("input-city"), {
      target: { value: "Berlin" },
    });
    expect(actions.set).toHaveBeenCalledTimes(1);
    expect(actions.set).toHaveBeenCalledWith("Berlin");
    expect(actions.clear).not.toHaveBeenCalled();
  });

  it("CLEARS the parameter when the field is emptied — never sets ''", () => {
    const actions = makeActions(entry("Berlin"));
    render(<ParamText parameterName="city" actions={actions} />);
    fireEvent.change(screen.getByTestId("input-city"), {
      target: { value: "" },
    });
    expect(actions.clear).toHaveBeenCalledTimes(1);
    expect(actions.set).not.toHaveBeenCalled();
  });
});

describe("ParamText — prop forwarding", () => {
  it("forwards parameterName, placeholder and className to the child", () => {
    render(
      <ParamText
        parameterName="city"
        actions={makeActions()}
        placeholder="Any city"
        className="w-48"
      />,
    );
    const p = lastProps();
    expect(p.parameterName).toBe("city");
    expect(p.placeholder).toBe("Any city");
    expect(p.className).toBe("w-48");
    expect(screen.getByTestId("input-city")).toHaveAttribute(
      "placeholder",
      "Any city",
    );
  });
});
