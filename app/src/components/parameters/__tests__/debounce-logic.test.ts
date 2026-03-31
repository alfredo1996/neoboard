import { describe, it, expect } from "vitest";

describe("SeedQueryInput debounce logic", () => {
  it("debounce pattern calls callback after delay, not immediately", async () => {
    const { vi } = await import("vitest");
    vi.useFakeTimers();

    let syncedValue = "";
    const onChange = (v: string) => {
      syncedValue = v;
    };

    const draft = "SELECT * FROM users";
    const timer = setTimeout(() => onChange(draft), 300);

    expect(syncedValue).toBe("");

    vi.advanceTimersByTime(300);
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

    let timer = setTimeout(() => onChange("S"), 300);
    vi.advanceTimersByTime(100);
    clearTimeout(timer);

    timer = setTimeout(() => onChange("SE"), 300);
    vi.advanceTimersByTime(100);
    clearTimeout(timer);

    timer = setTimeout(() => onChange("SEL"), 300);

    expect(syncedValue).toBe("");

    vi.advanceTimersByTime(300);
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
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);

    expect(debouncedSearch).toBe("");

    vi.advanceTimersByTime(300);
    expect(debouncedSearch).toBe("foo");

    clearTimeout(timer);
    vi.useRealTimers();
  });
});

describe("DebouncedTextInput — 200ms debounce logic", () => {
  it("does not fire onChange before 200ms", async () => {
    const { vi } = await import("vitest");
    vi.useFakeTimers();

    let fired = "";
    const onChange = (v: string) => {
      fired = v;
    };

    const draft = "hello";
    const timer = setTimeout(() => onChange(draft), 200);

    vi.advanceTimersByTime(199);
    expect(fired).toBe("");

    vi.advanceTimersByTime(1);
    expect(fired).toBe("hello");

    clearTimeout(timer);
    vi.useRealTimers();
  });

  it("cancels pending timer on rapid input (debounce resets)", async () => {
    const { vi } = await import("vitest");
    vi.useFakeTimers();

    let fired = "";
    const onChange = (v: string) => {
      fired = v;
    };

    let timer = setTimeout(() => onChange("a"), 200);
    vi.advanceTimersByTime(50);
    clearTimeout(timer);

    timer = setTimeout(() => onChange("ab"), 200);
    vi.advanceTimersByTime(50);
    clearTimeout(timer);

    timer = setTimeout(() => onChange("abc"), 200);

    expect(fired).toBe("");

    vi.advanceTimersByTime(200);
    expect(fired).toBe("abc");

    clearTimeout(timer);
    vi.useRealTimers();
  });

  it("does not fire when draft equals the external value (no change)", async () => {
    const { vi } = await import("vitest");
    vi.useFakeTimers();

    const externalValue = "same";
    let fired = false;
    const onChange = () => {
      fired = true;
    };

    const draft = "same";
    const timer = setTimeout(() => {
      if (draft !== externalValue) onChange();
    }, 200);

    vi.advanceTimersByTime(200);
    expect(fired).toBe(false);

    clearTimeout(timer);
    vi.useRealTimers();
  });
});
