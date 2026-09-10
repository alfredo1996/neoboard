/**
 * ParamMultiSelect — render tests for the wrapper's own two-way normalisation.
 *
 * The wrapper is the only place where the store's raw typed values and
 * ParamMultiSelector's `values: string[]` are reconciled, and where an empty
 * selection is turned into a *delete* rather than a write of `[]`. Both are
 * one-liners that fail silently: numeric raw values would stop matching option
 * values (selected chips vanish), and an empty array would keep the parameter
 * live and substituting an empty IN-list.
 *
 * These assert what the COMPONENT does — deleting param-multi-select.tsx makes
 * this file fail to import (#1629).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import React from "react";
import type { ParameterEntry } from "@/stores/parameter-store";
import type { ParamActions } from "../use-param-actions";
import type { SeedQueryResult } from "../use-seed-query-options";

/* ---------- mocks (declared before the import under test) ---------- */

// Capture-and-fire: the stand-in records every props object it is rendered
// with so tests can inspect what the wrapper handed down *and* invoke the
// callbacks it wired up.
const multiProps: Array<Record<string, unknown>> = [];

vi.mock("@neoboard/components", () => ({
  Button: ({
    children,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...rest}>{children}</button>
  ),
  ParamMultiSelector: (p: Record<string, unknown>) => {
    multiProps.push(p);
    return <div data-testid={`multi-${p.parameterName}`} />;
  },
}));

/* ---------- import under test ---------- */
import { ParamMultiSelect } from "../param-multi-select";
import { ConnectorUnavailableError } from "@/lib/api/api-client";
import { hintForConnectionErrorCode } from "@/lib/connector/connection-error-classifier";

/* ---------- helpers ---------- */

function makeActions(value?: unknown, hasEntry = true): ParamActions {
  const currentEntry: ParameterEntry | undefined = hasEntry
    ? {
        value,
        source: "Parameter Selector",
        field: "tags",
        type: "multi-select",
        sourceType: "selector-widget",
      }
    : undefined;
  return {
    set: vi.fn(),
    clear: vi.fn(),
    setCompanion: vi.fn(),
    clearCompanion: vi.fn(),
    currentEntry,
  };
}

function makeSeed(overrides: Partial<SeedQueryResult> = {}): SeedQueryResult {
  return {
    options: [],
    loading: false,
    error: null,
    refetch: vi.fn(),
    setSearchTerm: vi.fn(),
    parentValue: undefined,
    ...overrides,
  };
}

function renderWidget(
  actions: ParamActions,
  seed: SeedQueryResult = makeSeed(),
  extra: Partial<React.ComponentProps<typeof ParamMultiSelect>> = {},
) {
  render(
    <ParamMultiSelect
      parameterName="tags"
      actions={actions}
      seed={seed}
      searchable={false}
      {...extra}
    />,
  );
  return multiProps[multiProps.length - 1];
}

/** The props the child was last rendered with. */
function lastProps() {
  return multiProps[multiProps.length - 1];
}

function fireChange(vals: string[]) {
  act(() => {
    (lastProps().onChange as (v: string[]) => void)(vals);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  multiProps.length = 0;
});

/** #1678 — same contract as ParamSelect: a rejected seed query is not "no rows". */
describe("ParamMultiSelect — seed query error (#1678)", () => {
  it("names the connector instead of rendering an empty multi-select", () => {
    renderWidget(
      makeActions(undefined, false),
      makeSeed({
        error: new ConnectorUnavailableError("dead", "auth_failed"),
      }),
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Connector unavailable");
    expect(alert).toHaveTextContent(hintForConnectionErrorCode("auth_failed"));
    expect(screen.queryByTestId("multi-tags")).toBeNull();
  });

  it("offers a Retry that re-runs the seed query", () => {
    const refetch = vi.fn();
    renderWidget(
      makeActions(undefined, false),
      makeSeed({
        error: new ConnectorUnavailableError("dead", "network"),
        refetch,
      }),
    );
    screen.getByRole("button", { name: "Retry" }).click();
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe("ParamMultiSelect — reading the stored value", () => {
  it("renders the child widget under its parameter name", () => {
    renderWidget(makeActions(undefined, false));
    expect(screen.getByTestId("multi-tags")).toBeInTheDocument();
  });

  it("gives the child an empty array when no parameter is set", () => {
    const props = renderWidget(makeActions(undefined, false));
    expect(props.values).toEqual([]);
  });

  it("stringifies a stored array so numeric raw values still match options", () => {
    const props = renderWidget(makeActions([1, 2]));
    expect(props.values).toEqual(["1", "2"]);
    expect((props.values as string[]).every((v) => typeof v === "string")).toBe(
      true,
    );
  });

  it("wraps a stored scalar in an array (store coerces single values)", () => {
    const props = renderWidget(makeActions("x"));
    expect(props.values).toEqual(["x"]);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["0", 0],
    ["empty string", ""],
  ] as const)("treats a falsy stored value (%s) as no selection", (_l, v) => {
    const props = renderWidget(makeActions(v));
    expect(props.values).toEqual([]);
  });
});

describe("ParamMultiSelect — writing the selection back", () => {
  const OPTIONS = [
    { value: "a", label: "A", rawValue: 1 },
    { value: "b", label: "B" },
    { value: "zero", label: "Zero", rawValue: 0 },
    { value: "nil", label: "Nil", rawValue: null },
  ];

  it("maps each selected string back to its option's rawValue", () => {
    const actions = makeActions(undefined, false);
    renderWidget(actions, makeSeed({ options: OPTIONS }));
    fireChange(["a"]);
    expect(actions.set).toHaveBeenCalledWith([1]);
  });

  it("maps per element — an option without rawValue keeps its string", () => {
    const actions = makeActions(undefined, false);
    renderWidget(actions, makeSeed({ options: OPTIONS }));
    fireChange(["a", "b"]);
    expect(actions.set).toHaveBeenCalledWith([1, "b"]);
  });

  it("preserves falsy rawValues (0, null) instead of the string fallback", () => {
    const actions = makeActions(undefined, false);
    renderWidget(actions, makeSeed({ options: OPTIONS }));
    fireChange(["zero", "nil"]);
    expect(actions.set).toHaveBeenCalledWith([0, null]);
  });

  it("keeps the raw string when the value is not in the options list", () => {
    const actions = makeActions(undefined, false);
    renderWidget(actions, makeSeed({ options: OPTIONS }));
    fireChange(["stale"]);
    expect(actions.set).toHaveBeenCalledWith(["stale"]);
  });

  it("clears the parameter when everything is deselected", () => {
    const actions = makeActions([1, 2]);
    renderWidget(actions, makeSeed({ options: OPTIONS }));
    fireChange([]);
    expect(actions.clear).toHaveBeenCalledTimes(1);
    expect(actions.set).not.toHaveBeenCalled();
  });
});

describe("ParamMultiSelect — prop forwarding", () => {
  it("passes seed options, loading and parentValue straight through", () => {
    const options = [{ value: "a", label: "A" }];
    const props = renderWidget(
      makeActions(undefined, false),
      makeSeed({ options, loading: true, parentValue: "US" }),
      { parentParameterName: "country" },
    );
    expect(props.options).toBe(options);
    expect(props.loading).toBe(true);
    expect(props.parentValue).toBe("US");
    expect(props.parentParameterName).toBe("country");
  });

  it("forwards placeholder and className", () => {
    const props = renderWidget(makeActions(undefined, false), makeSeed(), {
      placeholder: "Pick tags…",
      className: "w-64",
    });
    expect(props.placeholder).toBe("Pick tags…");
    expect(props.className).toBe("w-64");
  });

  it("withholds onSearch when the widget is not searchable", () => {
    const seed = makeSeed();
    const props = renderWidget(makeActions(undefined, false), seed, {
      searchable: false,
    });
    expect(props.searchable).toBe(false);
    expect(props.onSearch).toBeUndefined();
  });

  it("wires onSearch to the seed's setSearchTerm when searchable", () => {
    const seed = makeSeed();
    const props = renderWidget(makeActions(undefined, false), seed, {
      searchable: true,
    });
    expect(props.searchable).toBe(true);
    (props.onSearch as (t: string) => void)("ber");
    expect(seed.setSearchTerm).toHaveBeenCalledWith("ber");
  });
});
