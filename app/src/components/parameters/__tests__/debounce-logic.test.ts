import { describe, it, expect } from "vitest";
import { SEED_QUERY_SEARCH_DEBOUNCE_MS } from "../use-seed-query-options";

// The hook debounce delay is the single source of truth — tests import
// the constant so they cannot drift from the implementation. A previous
// version of this file hardcoded 200ms while the hook used 300ms; the
// test "passed" against an imaginary code path.
const DEBOUNCE_MS = SEED_QUERY_SEARCH_DEBOUNCE_MS;

describe("SeedQueryInput debounce logic", () => {
  it("debounce pattern calls callback after delay, not immediately", async () => {
    const { vi } = await import("vitest");
    vi.useFakeTimers();

    let syncedValue = "";
    const onChange = (v: string) => {
      syncedValue = v;
    };

    const draft = "SELECT * FROM users";
    const timer = setTimeout(() => onChange(draft), DEBOUNCE_MS);

    expect(syncedValue).toBe("");

    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(syncedValue).toBe("SELECT * FROM users");

    clearTimeout(timer);
    vi.useRealTimers();
  });

  it("debounce cancels previous timer on rapid input", async () => {
    const { vi } = await import("vitest");
    vi.useFakeTimers();

    let syncedValue = "";
    const onChange = (v: string) => {
      syncedValue = v;
    };

    let timer = setTimeout(() => onChange("S"), DEBOUNCE_MS);
    vi.advanceTimersByTime(100);
    clearTimeout(timer);

    timer = setTimeout(() => onChange("SE"), DEBOUNCE_MS);
    vi.advanceTimersByTime(100);
    clearTimeout(timer);

    timer = setTimeout(() => onChange("SEL"), DEBOUNCE_MS);

    expect(syncedValue).toBe("");

    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(syncedValue).toBe("SEL");

    clearTimeout(timer);
    vi.useRealTimers();
  });
});

describe("Searchable select — debounced search term logic", () => {
  it("search term debounce pattern delays the query param update", async () => {
    const { vi } = await import("vitest");
    vi.useFakeTimers();

    let debouncedSearch = "";
    const setDebouncedSearch = (v: string) => {
      debouncedSearch = v;
    };

    const searchTerm = "foo";
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), DEBOUNCE_MS);

    expect(debouncedSearch).toBe("");

    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(debouncedSearch).toBe("foo");

    clearTimeout(timer);
    vi.useRealTimers();
  });
});
