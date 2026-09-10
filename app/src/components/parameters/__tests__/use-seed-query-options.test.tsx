import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useParameterStore } from "@/stores/parameter-store";
import {
  useSeedQueryOptions,
  seedFiltersOnServer,
  SEED_QUERY_SEARCH_DEBOUNCE_MS,
} from "../use-seed-query-options";

// next-auth's useSession is consulted for the tenant id; the seed query
// itself is mocked so we can inspect the params it receives.
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { tenantId: "test-tenant" } } }),
}));

type SeedSpyArgs = [
  connectionId: string | undefined,
  query: string | undefined,
  enabled: boolean,
  extraParams: Record<string, unknown> | undefined,
  tenantId: string | undefined,
];
type SeedSpyReturn = {
  options: { value: string; label: string }[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
};
const seedQuerySpy = vi.fn<(...args: SeedSpyArgs) => SeedSpyReturn>(() => ({
  options: [],
  loading: false,
  error: null,
  refetch: vi.fn(),
}));
vi.mock("@/hooks/use-seed-query", () => ({
  useSeedQuery: (...args: SeedSpyArgs) => seedQuerySpy(...args),
}));

function lastCallArgs(): SeedSpyArgs {
  const calls = seedQuerySpy.mock.calls;
  const last = calls[calls.length - 1];
  if (!last) throw new Error("useSeedQuery was never called");
  return last;
}

/**
 * #1678 — `error` used to be dropped here, so a dead connector behind a
 * select was an empty dropdown with no message and no way to tell it apart
 * from "no rows".
 */
describe("useSeedQueryOptions — threads the seed query error through (#1678)", () => {
  beforeEach(() => {
    seedQuerySpy.mockClear();
    useParameterStore.getState().clearAll();
  });

  it("exposes the seed query's refetch — the Retry behind SeedQueryError", () => {
    const refetch = vi.fn();
    seedQuerySpy.mockReturnValue({
      options: [],
      loading: false,
      error: null,
      refetch,
    });
    const { result } = renderHook(() =>
      useSeedQueryOptions("select", "conn-1", "SELECT 1", undefined, false),
    );
    expect(result.current.refetch).toBe(refetch);
  });

  it("exposes the seed query's error", () => {
    const dead = new Error("timeout exceeded when trying to connect");
    seedQuerySpy.mockReturnValueOnce({
      options: [],
      loading: false,
      error: dead,
      refetch: vi.fn(),
    });
    const { result } = renderHook(() =>
      useSeedQueryOptions("select", "conn-1", "SELECT 1", undefined, false),
    );
    expect(result.current.error).toBe(dead);
  });

  it("exposes null when the seed query succeeded", () => {
    const { result } = renderHook(() =>
      useSeedQueryOptions("select", "conn-1", "SELECT 1", undefined, false),
    );
    expect(result.current.error).toBeNull();
  });
});

describe("useSeedQueryOptions — cascading is keyed on the parent, not a type (#1360)", () => {
  beforeEach(() => {
    seedQuerySpy.mockClear();
    useParameterStore.getState().clearAll();
  });

  it("runs a plain select immediately when it has no parent", () => {
    renderHook(() =>
      useSeedQueryOptions("select", "conn-1", "SELECT 1", undefined, false),
    );
    const [, , enabled, extraParams] = lastCallArgs();
    expect(enabled).toBe(true);
    expect(extraParams).toBeUndefined();
  });

  it("gates a multi-select on its parent too", () => {
    renderHook(() =>
      useSeedQueryOptions(
        "multi-select",
        "conn-1",
        "SELECT 1",
        "country",
        false,
      ),
    );
    expect(lastCallArgs()[2]).toBe(false);

    useParameterStore
      .getState()
      .setParameter(
        "country",
        "US",
        "W",
        "country",
        "select",
        "selector-widget",
      );
    renderHook(() =>
      useSeedQueryOptions(
        "multi-select",
        "conn-1",
        "SELECT 1",
        "country",
        false,
      ),
    );
    const [, , enabled, extraParams] = lastCallArgs();
    expect(enabled).toBe(true);
    expect(extraParams).toEqual({ param_country: "US" });
  });

  it("treats an empty parent name as no parent at all", () => {
    renderHook(() =>
      useSeedQueryOptions("select", "conn-1", "SELECT 1", "", false),
    );
    expect(lastCallArgs()[2]).toBe(true);
  });
});

describe("useSeedQueryOptions — search term resets with the parent (#1360)", () => {
  beforeEach(() => {
    seedQuerySpy.mockClear();
    useParameterStore.getState().clearAll();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("drops a typed search term when the parent value changes", () => {
    useParameterStore
      .getState()
      .setParameter(
        "country",
        "US",
        "W",
        "country",
        "select",
        "selector-widget",
      );

    const { result } = renderHook(() =>
      useSeedQueryOptions("select", "conn-1", "SELECT 1", "country", true),
    );

    act(() => result.current.setSearchTerm("cal"));
    act(() => {
      vi.advanceTimersByTime(SEED_QUERY_SEARCH_DEBOUNCE_MS);
    });
    expect(lastCallArgs()[3]).toEqual({
      param_country: "US",
      param_search: "cal",
    });

    // Parent switches to a different country: the options reload, so the
    // term the user typed against the *previous* list must not keep
    // filtering the new one.
    act(() => {
      useParameterStore
        .getState()
        .setParameter(
          "country",
          "FR",
          "W",
          "country",
          "select",
          "selector-widget",
        );
    });
    expect(lastCallArgs()[3]).toEqual({ param_country: "FR" });

    // …and it must stay dropped once the debounce timer drains.
    act(() => {
      vi.advanceTimersByTime(SEED_QUERY_SEARCH_DEBOUNCE_MS);
    });
    expect(lastCallArgs()[3]).toEqual({ param_country: "FR" });
  });

  it("drops the search term when the parent is cleared entirely", () => {
    useParameterStore
      .getState()
      .setParameter(
        "country",
        "US",
        "W",
        "country",
        "select",
        "selector-widget",
      );

    const { result } = renderHook(() =>
      useSeedQueryOptions("select", "conn-1", "SELECT 1", "country", true),
    );

    act(() => result.current.setSearchTerm("cal"));
    act(() => {
      vi.advanceTimersByTime(SEED_QUERY_SEARCH_DEBOUNCE_MS);
    });
    expect(lastCallArgs()[3]).toEqual({
      param_country: "US",
      param_search: "cal",
    });

    act(() => {
      useParameterStore.getState().clearParameter("country");
    });
    act(() => {
      vi.advanceTimersByTime(SEED_QUERY_SEARCH_DEBOUNCE_MS);
    });

    const [, , enabled, extraParams] = lastCallArgs();
    expect(enabled).toBe(false);
    expect(extraParams).toBeUndefined();
  });

  it("keeps the search term while the parent holds still", () => {
    useParameterStore
      .getState()
      .setParameter(
        "country",
        "US",
        "W",
        "country",
        "select",
        "selector-widget",
      );

    const { rerender, result } = renderHook(() =>
      useSeedQueryOptions("select", "conn-1", "SELECT 1", "country", true),
    );

    act(() => result.current.setSearchTerm("cal"));
    act(() => {
      vi.advanceTimersByTime(SEED_QUERY_SEARCH_DEBOUNCE_MS);
    });
    rerender();

    expect(lastCallArgs()[3]).toEqual({
      param_country: "US",
      param_search: "cal",
    });
  });
});

describe("useSeedQueryOptions — parent-value coercion (regression: #859)", () => {
  beforeEach(() => {
    seedQuerySpy.mockClear();
    useParameterStore.getState().clearAll();
  });

  it("passes a string parent value through unchanged", () => {
    useParameterStore
      .getState()
      .setParameter(
        "country",
        "US",
        "W",
        "country",
        "select",
        "selector-widget",
      );
    renderHook(() =>
      useSeedQueryOptions("select", "conn-1", "SELECT 1", "country", false),
    );
    const [, , enabled, extraParams] = lastCallArgs();
    expect(enabled).toBe(true);
    expect(extraParams).toEqual({ param_country: "US" });
  });

  it("coerces a numeric parent value to its string form", () => {
    useParameterStore
      .getState()
      .setParameter(
        "region_id",
        42,
        "W",
        "region_id",
        "select",
        "selector-widget",
      );
    renderHook(() =>
      useSeedQueryOptions("select", "conn-1", "SELECT 1", "region_id", false),
    );
    const [, , , extraParams] = lastCallArgs();
    expect(extraParams).toEqual({ param_region_id: "42" });
  });

  it("disables the cascade when parent is an array (multi-select)", () => {
    // Before the fix, String(["a","b"]) → "a,b" was substituted into the
    // seed query — corrupting the cascade.
    useParameterStore
      .getState()
      .setParameter(
        "tags",
        ["a", "b"],
        "W",
        "tags",
        "multi-select",
        "selector-widget",
      );
    renderHook(() =>
      useSeedQueryOptions("select", "conn-1", "SELECT 1", "tags", false),
    );
    const [, , enabled, extraParams] = lastCallArgs();
    expect(enabled).toBe(false);
    expect(extraParams).toBeUndefined();
  });

  it("disables the cascade when parent is a date-range object", () => {
    // Before the fix, String({from, to}) → "[object Object]" — useless.
    useParameterStore
      .getState()
      .setParameter(
        "period",
        { from: "2026-01-01", to: "2026-01-31" },
        "W",
        "period",
        "date-range",
        "selector-widget",
      );
    renderHook(() =>
      useSeedQueryOptions("select", "conn-1", "SELECT 1", "period", false),
    );
    const [, , enabled, extraParams] = lastCallArgs();
    expect(enabled).toBe(false);
    expect(extraParams).toBeUndefined();
  });

  it("disables the cascade when parent is unset", () => {
    renderHook(() =>
      useSeedQueryOptions("select", "conn-1", "SELECT 1", "country", false),
    );
    const [, , enabled] = lastCallArgs();
    expect(enabled).toBe(false);
  });
});

describe("useSeedQueryOptions — debouncedSearch reset (regression: #859)", () => {
  beforeEach(() => {
    seedQuerySpy.mockClear();
    useParameterStore.getState().clearAll();
    vi.useFakeTimers();
  });

  it("flushes a pending search term when searchable flips to false", () => {
    const { rerender, result } = renderHook(
      ({ searchable }: { searchable: boolean }) =>
        useSeedQueryOptions(
          "select",
          "conn-1",
          "SELECT 1",
          undefined,
          searchable,
        ),
      { initialProps: { searchable: true } },
    );

    act(() => {
      result.current.setSearchTerm("typed-then-disabled");
    });
    act(() => {
      vi.advanceTimersByTime(SEED_QUERY_SEARCH_DEBOUNCE_MS);
    });
    // Sanity: while searchable, the search term flows into extraParams.
    expect(lastCallArgs()[3]).toEqual({
      param_search: "typed-then-disabled",
    });

    seedQuerySpy.mockClear();
    rerender({ searchable: false });

    // After flipping to non-searchable, extraParams must no longer
    // include the stale `param_search`. (No parent params either, so
    // the hook returns undefined for extraParams.)
    expect(lastCallArgs()[3]).toBeUndefined();
  });
});

// #1411: when the seed query consumes `$param_search`, the server has already
// filtered the rows and the combobox must not filter them a second time.
describe("seedFiltersOnServer (#1411)", () => {
  it("is true for a searchable seed that uses $param_search", () => {
    expect(
      seedFiltersOnServer(
        true,
        "MATCH (p:Person) WHERE p.email STARTS WITH $param_search RETURN p",
      ),
    ).toBe(true);
  });

  it("is false when the seed ignores the search term", () => {
    expect(seedFiltersOnServer(true, "MATCH (p:Person) RETURN p")).toBe(false);
  });

  it("does not mistake a longer parameter name for $param_search", () => {
    expect(seedFiltersOnServer(true, "RETURN $param_search_scope")).toBe(false);
  });

  it("is false when the widget is not searchable", () => {
    expect(seedFiltersOnServer(false, "RETURN $param_search")).toBe(false);
    expect(seedFiltersOnServer(undefined, "RETURN $param_search")).toBe(false);
  });

  it("is false without a seed query", () => {
    expect(seedFiltersOnServer(true, undefined)).toBe(false);
  });
});

describe("useSeedQueryOptions — exposes serverFiltered (#1411)", () => {
  beforeEach(() => {
    seedQuerySpy.mockClear();
    useParameterStore.getState().clearAll();
  });

  it("is true for a searchable seed that uses $param_search", () => {
    const { result } = renderHook(() =>
      useSeedQueryOptions(
        "select",
        "conn-1",
        "RETURN $param_search AS value",
        undefined,
        true,
      ),
    );
    expect(result.current.serverFiltered).toBe(true);
  });

  it("is false for a seed that ignores the search term", () => {
    const { result } = renderHook(() =>
      useSeedQueryOptions("select", "conn-1", "SELECT 1", undefined, true),
    );
    expect(result.current.serverFiltered).toBe(false);
  });
});
