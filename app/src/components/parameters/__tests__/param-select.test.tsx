/**
 * ParamSelect — the wrapper's own contract, rendered.
 *
 * Two things live here and nowhere else (#1629):
 *  1. READ coercion — `String(currentEntry.value ?? "")`. The store holds the
 *     DB's typed value (a number 42); ParamSelector matches its `value` prop
 *     against option `value` STRINGS. Drop the String() and a set parameter
 *     silently renders as the placeholder.
 *  2. WRITE mapping — empty selection clears the parameter, otherwise the
 *     chosen string is mapped back through `seed.options` to `rawValue` using
 *     `!== undefined` (not `??`, not truthiness) so 0 / "" / false / null
 *     survive as DB types.
 * Plus the `onSearch={searchable ? … : undefined}` gate.
 *
 * These assert what the COMPONENT does — delete param-select.tsx and this file
 * fails to import.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import type { ParamActions } from "../use-param-actions";
import type { ParameterType } from "@/stores/parameter-store";
import type { SeedQueryResult } from "../use-seed-query-options";

/* ---------- mocks (declared before imports) ---------- */

const paramSelectorProps: Array<Record<string, unknown>> = [];

vi.mock("@neoboard/components", () => ({
  ParamSelector: (p: Record<string, unknown>) => {
    paramSelectorProps.push(p);
    return (
      <div data-testid={`param-selector-${p.parameterName}`}>
        <button
          data-testid="ps-change"
          onClick={() => (p.onChange as (v: string) => void)("42")}
        >
          choose 42
        </button>
        <button
          data-testid="ps-change-missing"
          onClick={() => (p.onChange as (v: string) => void)("not-an-option")}
        >
          choose missing
        </button>
        <button
          data-testid="ps-clear"
          onClick={() => (p.onChange as (v: string) => void)("")}
        >
          clear
        </button>
      </div>
    );
  },
}));

/* ---------- import under test ---------- */
import { ParamSelect } from "../param-select";

type Entry = ParamActions["currentEntry"];

let actions: ParamActions;
let setSearchTerm: ReturnType<typeof vi.fn<(term: string) => void>>;

function makeActions(currentEntry?: Entry): ParamActions {
  return {
    set: vi.fn<(value: unknown) => void>(),
    clear: vi.fn<() => void>(),
    setCompanion:
      vi.fn<(suffix: string, value: unknown, type: ParameterType) => void>(),
    clearCompanion: vi.fn<(suffix: string) => void>(),
    currentEntry,
  };
}

function entry(value: unknown): Entry {
  return {
    value,
    source: "Parameter Selector",
    field: "choice",
    type: "select",
    sourceType: "selector-widget",
  };
}

function makeSeed(over: Partial<SeedQueryResult> = {}): SeedQueryResult {
  return {
    options: [{ value: "42", label: "Forty-Two", rawValue: 42 }],
    loading: false,
    setSearchTerm,
    parentValue: undefined,
    ...over,
  };
}

function renderSelect(
  over: {
    currentEntry?: Entry;
    seed?: Partial<SeedQueryResult>;
    searchable?: boolean;
    parentParameterName?: string;
    placeholder?: string;
    className?: string;
  } = {},
) {
  actions = makeActions(over.currentEntry);
  render(
    <ParamSelect
      parameterName="choice"
      actions={actions}
      seed={makeSeed(over.seed)}
      searchable={over.searchable ?? false}
      parentParameterName={over.parentParameterName}
      placeholder={over.placeholder}
      className={over.className}
    />,
  );
  return paramSelectorProps[paramSelectorProps.length - 1];
}

beforeEach(() => {
  vi.clearAllMocks();
  paramSelectorProps.length = 0;
  // clearAllMocks clears calls, not implementations — rebuild the spies.
  setSearchTerm = vi.fn<(term: string) => void>();
  actions = makeActions();
});

describe("ParamSelect — read coercion", () => {
  it("passes '' when there is no stored entry (placeholder, not undefined)", () => {
    const props = renderSelect();
    expect(props.value).toBe("");
  });

  it("stringifies a typed value so the option matches by string", () => {
    const props = renderSelect({ currentEntry: entry(42) });
    expect(props.value).toBe("42");
  });

  it("maps a null stored value to '' rather than the literal 'null'", () => {
    const props = renderSelect({ currentEntry: entry(null) });
    expect(props.value).toBe("");
  });

  it("stringifies a boolean stored value", () => {
    const props = renderSelect({ currentEntry: entry(false) });
    expect(props.value).toBe("false");
  });
});

describe("ParamSelect — write mapping", () => {
  it("sets the option's rawValue as a NUMBER, not the option string", () => {
    renderSelect();
    fireEvent.click(screen.getByTestId("ps-change"));
    expect(actions.set).toHaveBeenCalledTimes(1);
    expect(actions.set).toHaveBeenCalledWith(42);
    expect(actions.clear).not.toHaveBeenCalled();
  });

  it.each([
    ["zero", 0],
    ["empty string", ""],
    ["false", false],
    ["null", null],
  ] as const)(
    "keeps a falsy rawValue (%s) instead of the string",
    (_l, raw) => {
      renderSelect({
        seed: { options: [{ value: "42", label: "F", rawValue: raw }] },
      });
      fireEvent.click(screen.getByTestId("ps-change"));
      expect(actions.set).toHaveBeenCalledWith(raw);
    },
  );

  it("falls back to the raw string when the option has no rawValue", () => {
    renderSelect({ seed: { options: [{ value: "42", label: "F" }] } });
    fireEvent.click(screen.getByTestId("ps-change"));
    expect(actions.set).toHaveBeenCalledWith("42");
  });

  it("falls back to the raw string when the value is not in the option list", () => {
    renderSelect();
    fireEvent.click(screen.getByTestId("ps-change-missing"));
    expect(actions.set).toHaveBeenCalledWith("not-an-option");
  });

  it("clears the parameter on an empty selection instead of setting ''", () => {
    renderSelect({ currentEntry: entry(42) });
    fireEvent.click(screen.getByTestId("ps-clear"));
    expect(actions.clear).toHaveBeenCalledTimes(1);
    expect(actions.set).not.toHaveBeenCalled();
  });
});

describe("ParamSelect — prop forwarding", () => {
  it("withholds onSearch when the select is not searchable", () => {
    const props = renderSelect({ searchable: false });
    expect(props.searchable).toBe(false);
    expect(props.onSearch).toBeUndefined();
  });

  it("wires onSearch to seed.setSearchTerm when searchable", () => {
    const props = renderSelect({ searchable: true });
    expect(props.searchable).toBe(true);
    (props.onSearch as (t: string) => void)("ber");
    expect(setSearchTerm).toHaveBeenCalledWith("ber");
  });

  it("forwards options, loading, parentValue and parentParameterName", () => {
    const props = renderSelect({
      seed: { loading: true, parentValue: "US" },
      parentParameterName: "country",
    });
    expect(props.loading).toBe(true);
    expect(props.parentValue).toBe("US");
    expect(props.parentParameterName).toBe("country");
    expect(props.options).toEqual([
      { value: "42", label: "Forty-Two", rawValue: 42 },
    ]);
  });

  it("forwards parameterName, placeholder and className", () => {
    const props = renderSelect({ placeholder: "Pick one", className: "w-40" });
    expect(props.parameterName).toBe("choice");
    expect(props.placeholder).toBe("Pick one");
    expect(props.className).toBe("w-40");
    expect(screen.getByTestId("param-selector-choice")).toBeInTheDocument();
  });
});
