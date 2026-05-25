// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useParameterStore } from "@/stores/parameter-store";
import {
  useSeedQueryOptions,
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
};
const seedQuerySpy = vi.fn<(...args: SeedSpyArgs) => SeedSpyReturn>(() => ({
  options: [],
  loading: false,
  error: null,
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
      useSeedQueryOptions(
        "cascading-select",
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
      useSeedQueryOptions(
        "cascading-select",
        "conn-1",
        "SELECT 1",
        "region_id",
        false,
      ),
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
      useSeedQueryOptions(
        "cascading-select",
        "conn-1",
        "SELECT 1",
        "tags",
        false,
      ),
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
      useSeedQueryOptions(
        "cascading-select",
        "conn-1",
        "SELECT 1",
        "period",
        false,
      ),
    );
    const [, , enabled, extraParams] = lastCallArgs();
    expect(enabled).toBe(false);
    expect(extraParams).toBeUndefined();
  });

  it("disables the cascade when parent is unset", () => {
    renderHook(() =>
      useSeedQueryOptions(
        "cascading-select",
        "conn-1",
        "SELECT 1",
        "country",
        false,
      ),
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
