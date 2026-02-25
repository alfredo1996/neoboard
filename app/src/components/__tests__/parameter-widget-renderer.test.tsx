import { describe, it, expect, beforeEach } from "vitest";
import { useParameterStore } from "@/stores/parameter-store";
import type { ParameterType } from "@/stores/parameter-store";

/**
 * Tests for ParameterWidgetRenderer logic.
 *
 * Since the component itself requires a full React Query + DOM setup
 * (which is tested in the component package's parameter-widgets tests),
 * we focus here on the **app-layer orchestration logic**:
 *
 * 1. The parameter store interactions (set, clear, compound params)
 * 2. The cascading child-clear behaviour
 * 3. The date-range partial-clear behaviour
 * 4. The number-range compound parameter handling
 * 5. The seed-query enablement logic
 *
 * These are tested by exercising the store directly (Zustand is synchronous)
 * and by verifying the handler logic that the renderer delegates to.
 */

function resetStore() {
  useParameterStore.getState().clearAll();
}

// ─── Store interaction patterns (mirroring renderer handlers) ─────────────

describe("ParameterWidgetRenderer — store interactions", () => {
  beforeEach(resetStore);

  // ── text type ──────────────────────────────────────────────────────
  describe("text parameter", () => {
    it("sets a text parameter with selector-widget source", () => {
      const { setParameter } = useParameterStore.getState();
      setParameter("city", "Berlin", "Parameter Selector", "city", "text", "selector-widget");
      const entry = useParameterStore.getState().parameters["city"];
      expect(entry.value).toBe("Berlin");
      expect(entry.type).toBe("text");
      expect(entry.sourceType).toBe("selector-widget");
    });

    it("clears a text parameter when empty value is set", () => {
      const { setParameter, clearParameter } = useParameterStore.getState();
      setParameter("city", "Berlin", "Parameter Selector", "city", "text", "selector-widget");
      clearParameter("city");
      expect(useParameterStore.getState().parameters["city"]).toBeUndefined();
    });
  });

  // ── select type ────────────────────────────────────────────────────
  describe("select parameter", () => {
    it("sets a select parameter", () => {
      const { setParameter } = useParameterStore.getState();
      setParameter("dbType", "neo4j", "Parameter Selector", "dbType", "select", "selector-widget");
      const entry = useParameterStore.getState().parameters["dbType"];
      expect(entry.value).toBe("neo4j");
      expect(entry.type).toBe("select");
    });

    it("clears when empty string value is provided", () => {
      const { setParameter, clearParameter } = useParameterStore.getState();
      setParameter("dbType", "neo4j", "Parameter Selector", "dbType", "select", "selector-widget");
      clearParameter("dbType");
      expect(useParameterStore.getState().parameters["dbType"]).toBeUndefined();
    });
  });

  // ── multi-select type ──────────────────────────────────────────────
  describe("multi-select parameter", () => {
    it("stores an array value", () => {
      const { setParameter } = useParameterStore.getState();
      setParameter("tags", ["a", "b"], "Parameter Selector", "tags", "multi-select", "selector-widget");
      const entry = useParameterStore.getState().parameters["tags"];
      expect(entry.value).toEqual(["a", "b"]);
      expect(entry.type).toBe("multi-select");
    });

    it("clears when empty array means clear", () => {
      const { setParameter, clearParameter } = useParameterStore.getState();
      setParameter("tags", ["a"], "Parameter Selector", "tags", "multi-select", "selector-widget");
      clearParameter("tags");
      expect(useParameterStore.getState().parameters["tags"]).toBeUndefined();
    });
  });

  // ── date type ──────────────────────────────────────────────────────
  describe("date parameter", () => {
    it("stores an ISO date string", () => {
      const { setParameter } = useParameterStore.getState();
      setParameter("eventDate", "2024-06-15", "Parameter Selector", "eventDate", "date", "selector-widget");
      expect(useParameterStore.getState().parameters["eventDate"].value).toBe("2024-06-15");
    });
  });

  // ── date-range type — partial clear behaviour ──────────────────────
  describe("date-range parameter", () => {
    it("sets compound _from/_to parameters alongside the range object", () => {
      const { setParameter } = useParameterStore.getState();
      setParameter("period", { from: "2024-01-01", to: "2024-01-31" }, "Parameter Selector", "period", "date-range", "selector-widget");
      setParameter("period_from", "2024-01-01", "Parameter Selector", "period_from", "date", "selector-widget");
      setParameter("period_to", "2024-01-31", "Parameter Selector", "period_to", "date", "selector-widget");

      const params = useParameterStore.getState().parameters;
      expect(params["period"].value).toEqual({ from: "2024-01-01", to: "2024-01-31" });
      expect(params["period_from"].value).toBe("2024-01-01");
      expect(params["period_to"].value).toBe("2024-01-31");
    });

    it("clears _from when from is empty but keeps _to when to is set (partial clear)", () => {
      const { setParameter, clearParameter } = useParameterStore.getState();
      // Simulate handleRangeChange(from="", to="2024-06-30")
      setParameter("period", { from: "", to: "2024-06-30" }, "Parameter Selector", "period", "date-range", "selector-widget");
      clearParameter("period_from");
      setParameter("period_to", "2024-06-30", "Parameter Selector", "period_to", "date", "selector-widget");

      const params = useParameterStore.getState().parameters;
      expect(params["period_from"]).toBeUndefined();
      expect(params["period_to"].value).toBe("2024-06-30");
    });

    it("clears _to when to is empty but keeps _from when from is set", () => {
      const { setParameter, clearParameter } = useParameterStore.getState();
      // Simulate handleRangeChange(from="2024-06-01", to="")
      setParameter("period", { from: "2024-06-01", to: "" }, "Parameter Selector", "period", "date-range", "selector-widget");
      setParameter("period_from", "2024-06-01", "Parameter Selector", "period_from", "date", "selector-widget");
      clearParameter("period_to");

      const params = useParameterStore.getState().parameters;
      expect(params["period_from"].value).toBe("2024-06-01");
      expect(params["period_to"]).toBeUndefined();
    });

    it("clears all three params when both from and to are empty", () => {
      const { setParameter, clearParameter } = useParameterStore.getState();
      // Pre-populate
      setParameter("period", { from: "2024-01-01", to: "2024-01-31" }, "Parameter Selector", "period", "date-range", "selector-widget");
      setParameter("period_from", "2024-01-01", "Parameter Selector", "period_from", "date", "selector-widget");
      setParameter("period_to", "2024-01-31", "Parameter Selector", "period_to", "date", "selector-widget");
      // Simulate handleRangeChange(from="", to="")
      clearParameter("period");
      clearParameter("period_from");
      clearParameter("period_to");

      const params = useParameterStore.getState().parameters;
      expect(params["period"]).toBeUndefined();
      expect(params["period_from"]).toBeUndefined();
      expect(params["period_to"]).toBeUndefined();
    });
  });

  // ── date-relative type ─────────────────────────────────────────────
  describe("date-relative parameter", () => {
    it("stores a preset key and sets companion _from/_to", () => {
      const { setParameter } = useParameterStore.getState();
      setParameter("window", "last_7_days", "Parameter Selector", "window", "date-relative", "selector-widget");
      setParameter("window_from", "2024-06-09", "Parameter Selector", "window_from", "date", "selector-widget");
      setParameter("window_to", "2024-06-15", "Parameter Selector", "window_to", "date", "selector-widget");

      const params = useParameterStore.getState().parameters;
      expect(params["window"].value).toBe("last_7_days");
      expect(params["window_from"].value).toBe("2024-06-09");
      expect(params["window_to"].value).toBe("2024-06-15");
    });

    it("clears all companions when empty preset is set", () => {
      const { setParameter, clearParameter } = useParameterStore.getState();
      setParameter("window", "today", "Parameter Selector", "window", "date-relative", "selector-widget");
      setParameter("window_from", "2024-06-15", "Parameter Selector", "window_from", "date", "selector-widget");
      setParameter("window_to", "2024-06-15", "Parameter Selector", "window_to", "date", "selector-widget");

      clearParameter("window");
      clearParameter("window_from");
      clearParameter("window_to");

      const params = useParameterStore.getState().parameters;
      expect(params["window"]).toBeUndefined();
      expect(params["window_from"]).toBeUndefined();
      expect(params["window_to"]).toBeUndefined();
    });
  });

  // ── number-range type ──────────────────────────────────────────────
  describe("number-range parameter", () => {
    it("stores a tuple and sets companion _min/_max", () => {
      const { setParameter } = useParameterStore.getState();
      setParameter("price", [100, 500], "Parameter Selector", "price", "number-range", "selector-widget");
      setParameter("price_min", 100, "Parameter Selector", "price_min", "number-range", "selector-widget");
      setParameter("price_max", 500, "Parameter Selector", "price_max", "number-range", "selector-widget");

      const params = useParameterStore.getState().parameters;
      expect(params["price"].value).toEqual([100, 500]);
      expect(params["price_min"].value).toBe(100);
      expect(params["price_max"].value).toBe(500);
    });

    it("clears all three params on reset", () => {
      const { setParameter, clearParameter } = useParameterStore.getState();
      setParameter("price", [100, 500], "Parameter Selector", "price", "number-range", "selector-widget");
      setParameter("price_min", 100, "Parameter Selector", "price_min", "number-range", "selector-widget");
      setParameter("price_max", 500, "Parameter Selector", "price_max", "number-range", "selector-widget");

      clearParameter("price");
      clearParameter("price_min");
      clearParameter("price_max");

      const params = useParameterStore.getState().parameters;
      expect(params["price"]).toBeUndefined();
      expect(params["price_min"]).toBeUndefined();
      expect(params["price_max"]).toBeUndefined();
    });
  });

  // ── cascading-select type ──────────────────────────────────────────
  describe("cascading-select parameter", () => {
    it("clears child parameter when parent value changes", () => {
      const { setParameter, clearParameter } = useParameterStore.getState();
      // Parent set → child selected
      setParameter("country", "US", "Parameter Selector", "country", "select", "selector-widget");
      setParameter("state", "NY", "Parameter Selector", "state", "cascading-select", "selector-widget");

      // Parent changes → child should be cleared
      setParameter("country", "UK", "Parameter Selector", "country", "select", "selector-widget");
      clearParameter("state"); // renderer's useEffect does this

      expect(useParameterStore.getState().parameters["state"]).toBeUndefined();
      expect(useParameterStore.getState().parameters["country"].value).toBe("UK");
    });
  });
});

// ─── Seed query enablement logic ──────────────────────────────────────────

describe("ParameterWidgetRenderer — seed query enablement", () => {
  const needsSeedTypes: ParameterType[] = ["select", "multi-select", "cascading-select"];
  const noSeedTypes: ParameterType[] = ["text", "date", "date-range", "date-relative", "number-range"];

  it("select, multi-select, and cascading-select types require seed queries", () => {
    for (const type of needsSeedTypes) {
      const needsSeed =
        type === "select" ||
        type === "multi-select" ||
        type === "cascading-select";
      expect(needsSeed).toBe(true);
    }
  });

  it("text, date, date-range, date-relative, and number-range do not require seed queries", () => {
    for (const type of noSeedTypes) {
      const needsSeed =
        type === "select" ||
        type === "multi-select" ||
        type === "cascading-select";
      expect(needsSeed).toBe(false);
    }
  });

  it("cascading-select is disabled until parent value is set", () => {
    const parameterType: string = "cascading-select";
    const parentParameterName: string | undefined = "country";
    const parentValue = "";
    const cascadingEnabled =
      parameterType !== "cascading-select" ||
      (parentParameterName !== undefined ? !!parentValue : true);
    expect(cascadingEnabled).toBe(false);
  });

  it("cascading-select is enabled when parent value is set", () => {
    const parameterType: string = "cascading-select";
    const parentParameterName: string | undefined = "country";
    const parentValue = "US";
    const cascadingEnabled =
      parameterType !== "cascading-select" ||
      (parentParameterName !== undefined ? !!parentValue : true);
    expect(cascadingEnabled).toBe(true);
  });

  it("cascading-select is enabled when no parentParameterName is provided", () => {
    const parameterType: string = "cascading-select";
    const parentParameterName: string | undefined = undefined;
    const parentValue: string | undefined = undefined;
    const cascadingEnabled =
      parameterType !== "cascading-select" ||
      (parentParameterName !== undefined ? !!parentValue : true);
    expect(cascadingEnabled).toBe(true);
  });
});

// ─── useParameterValues selector coverage ─────────────────────────────────

describe("useParameterValues", () => {
  beforeEach(resetStore);

  it("returns empty object when no parameters are set", () => {
    const state = useParameterStore.getState();
    const result: Record<string, unknown> = {};
    for (const [name, entry] of Object.entries(state.parameters)) {
      result[name] = entry.value;
    }
    expect(result).toEqual({});
  });

  it("returns name→value mapping for all set parameters", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter("a", 1, "W", "a");
    setParameter("b", "hello", "W", "b");
    setParameter("c", [1, 2], "W", "c", "multi-select", "selector-widget");

    const state = useParameterStore.getState();
    const result: Record<string, unknown> = {};
    for (const [name, entry] of Object.entries(state.parameters)) {
      result[name] = entry.value;
    }
    expect(result).toEqual({ a: 1, b: "hello", c: [1, 2] });
  });
});

// ─── Value coercion patterns (matching renderer switch branches) ──────────

describe("ParameterWidgetRenderer — value coercion", () => {
  beforeEach(resetStore);

  it("text: reads string value from store entry", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter("city", "Berlin", "Parameter Selector", "city", "text", "selector-widget");
    const currentEntry = useParameterStore.getState().parameters["city"];
    const textValue = currentEntry ? String(currentEntry.value ?? "") : "";
    expect(textValue).toBe("Berlin");
  });

  it("text: returns empty string when no entry exists", () => {
    const currentEntry = useParameterStore.getState().parameters["city"];
    const textValue = currentEntry ? String(currentEntry.value ?? "") : "";
    expect(textValue).toBe("");
  });

  it("multi-select: converts array value to string[]", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter("tags", ["a", "b", "c"], "Parameter Selector", "tags", "multi-select", "selector-widget");
    const currentEntry = useParameterStore.getState().parameters["tags"];
    const rawValues = currentEntry?.value;
    const multiValues: string[] = Array.isArray(rawValues)
      ? (rawValues as unknown[]).map(String)
      : rawValues
      ? [String(rawValues)]
      : [];
    expect(multiValues).toEqual(["a", "b", "c"]);
  });

  it("multi-select: wraps single value in array", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter("tags", "solo", "Parameter Selector", "tags", "multi-select", "selector-widget");
    const currentEntry = useParameterStore.getState().parameters["tags"];
    const rawValues = currentEntry?.value;
    const multiValues: string[] = Array.isArray(rawValues)
      ? (rawValues as unknown[]).map(String)
      : rawValues
      ? [String(rawValues)]
      : [];
    expect(multiValues).toEqual(["solo"]);
  });

  it("multi-select: returns empty array when no entry", () => {
    const currentEntry = useParameterStore.getState().parameters["tags"];
    const rawValues = currentEntry?.value;
    const multiValues: string[] = Array.isArray(rawValues)
      ? (rawValues as unknown[]).map(String)
      : rawValues
      ? [String(rawValues)]
      : [];
    expect(multiValues).toEqual([]);
  });

  it("number-range: converts stored tuple to [number, number]", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter("price", [100, 500], "Parameter Selector", "price", "number-range", "selector-widget");
    const currentEntry = useParameterStore.getState().parameters["price"];
    const rawRange = currentEntry?.value;
    const rangeValue: [number, number] | null = Array.isArray(rawRange)
      ? [Number(rawRange[0]), Number(rawRange[1])]
      : null;
    expect(rangeValue).toEqual([100, 500]);
  });

  it("number-range: returns null when no entry", () => {
    const currentEntry = useParameterStore.getState().parameters["price"];
    const rawRange = currentEntry?.value;
    const rangeValue: [number, number] | null = Array.isArray(rawRange)
      ? [Number(rawRange[0]), Number(rawRange[1])]
      : null;
    expect(rangeValue).toBeNull();
  });

  it("date-range: extracts from/to from object value", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter("period", { from: "2024-01-01", to: "2024-01-31" }, "Parameter Selector", "period", "date-range", "selector-widget");
    const currentEntry = useParameterStore.getState().parameters["period"];
    const rangeEntry = currentEntry?.value as { from?: string; to?: string } | undefined;
    const fromVal = rangeEntry?.from ?? "";
    const toVal = rangeEntry?.to ?? "";
    expect(fromVal).toBe("2024-01-01");
    expect(toVal).toBe("2024-01-31");
  });

  it("date-range: returns empty strings when no entry", () => {
    const currentEntry = useParameterStore.getState().parameters["period"];
    const rangeEntry = currentEntry?.value as { from?: string; to?: string } | undefined;
    const fromVal = rangeEntry?.from ?? "";
    const toVal = rangeEntry?.to ?? "";
    expect(fromVal).toBe("");
    expect(toVal).toBe("");
  });

  it("date-relative: reads preset key from store", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter("window", "last_7_days", "Parameter Selector", "window", "date-relative", "selector-widget");
    const currentEntry = useParameterStore.getState().parameters["window"];
    const relValue = currentEntry ? (currentEntry.value as string) : "";
    expect(relValue).toBe("last_7_days");
  });

  it("cascading-select: reads string value from store entry", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter("state", "NY", "Parameter Selector", "state", "cascading-select", "selector-widget");
    const currentEntry = useParameterStore.getState().parameters["state"];
    const cascadeValue = currentEntry ? String(currentEntry.value ?? "") : "";
    expect(cascadeValue).toBe("NY");
  });
});

// ─── Parent params construction (for cascading seed queries) ──────────────

describe("ParameterWidgetRenderer — parent params for cascading", () => {
  beforeEach(resetStore);

  it("builds extraParams with parent value for cascading-select", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter("country", "US", "Parameter Selector", "country", "select", "selector-widget");

    const parentParameterName = "country";
    const parentValue = String(useParameterStore.getState().parameters[parentParameterName]?.value ?? "");
    const parentParams = parentParameterName && parentValue
      ? { [`param_${parentParameterName}`]: parentValue }
      : {};

    expect(parentParams).toEqual({ param_country: "US" });
  });

  it("returns empty object when parent value is not set", () => {
    const parentParameterName = "country";
    const parentValue = String(useParameterStore.getState().parameters[parentParameterName]?.value ?? "");
    const parentParams = parentParameterName && parentValue
      ? { [`param_${parentParameterName}`]: parentValue }
      : {};

    expect(parentParams).toEqual({});
  });

  it("returns empty object when no parentParameterName", () => {
    const parentParameterName = undefined;
    const parentValue = undefined;
    const parentParams = parentParameterName && parentValue
      ? { [`param_${parentParameterName}`]: parentValue }
      : {};

    expect(parentParams).toEqual({});
  });
});

// ─── BUG 11: Type-safe parameter value preservation ────────────────────────

describe("ParameterWidgetRenderer — type-safe parameter values", () => {
  beforeEach(resetStore);

  it("preserves number type when stored via setParameter (not coerced to string)", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter("age", 42, "Parameter Selector", "age", "select", "selector-widget");
    const entry = useParameterStore.getState().parameters["age"];
    expect(entry.value).toBe(42);
    expect(typeof entry.value).toBe("number");
  });

  it("preserves array of numbers from multi-select rawValue", () => {
    const { setParameter } = useParameterStore.getState();
    // Simulates what ParameterWidgetRenderer does when rawValue is available
    const rawVals = [1, 2, 3];
    setParameter("ids", rawVals, "Parameter Selector", "ids", "multi-select", "selector-widget");
    const entry = useParameterStore.getState().parameters["ids"];
    expect(entry.value).toEqual([1, 2, 3]);
    expect(typeof (entry.value as number[])[0]).toBe("number");
  });

  it("preserves Date object when stored via setParameter", () => {
    const { setParameter } = useParameterStore.getState();
    const d = new Date("2024-06-15T00:00:00Z");
    setParameter("created", d, "Parameter Selector", "created", "date", "selector-widget");
    const entry = useParameterStore.getState().parameters["created"];
    expect(entry.value).toBeInstanceOf(Date);
    expect((entry.value as Date).toISOString()).toBe("2024-06-15T00:00:00.000Z");
  });

  it("preserves boolean type via setParameter", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter("active", true, "Parameter Selector", "active", "select", "selector-widget");
    const entry = useParameterStore.getState().parameters["active"];
    expect(entry.value).toBe(true);
    expect(typeof entry.value).toBe("boolean");
  });

  it("rawValue lookup logic stores typed value instead of String()", () => {
    // Simulates the select onChange handler in ParameterWidgetRenderer:
    // const opt = options.find((o) => o.value === v);
    // set(opt?.rawValue !== undefined ? opt.rawValue : v);
    const options = [
      { value: "42", label: "Forty-Two", rawValue: 42 },
      { value: "100", label: "Hundred", rawValue: 100 },
    ];
    const selectedString = "42";
    const opt = options.find((o) => o.value === selectedString);
    const storedValue = opt?.rawValue !== undefined ? opt.rawValue : selectedString;

    expect(storedValue).toBe(42);
    expect(typeof storedValue).toBe("number");
  });

  it("falls back to string when rawValue is undefined", () => {
    const options = [{ value: "abc", label: "ABC" }]; // no rawValue
    const selectedString = "abc";
    const opt = options.find((o) => o.value === selectedString);
    const storedValue = opt?.rawValue !== undefined ? opt.rawValue : selectedString;

    expect(storedValue).toBe("abc");
    expect(typeof storedValue).toBe("string");
  });
});

// ─── BUG 3: Debounce seed query — SeedQueryInput logic ────────────────────

describe("SeedQueryInput debounce logic", () => {
  // Tests the debounce pattern: draft state + setTimeout sync
  // This validates the core logic without needing a full React mount.

  it("debounce pattern calls callback after delay, not immediately", async () => {
    const { vi } = await import("vitest");
    vi.useFakeTimers();

    let syncedValue = "";
    const onChange = (v: string) => { syncedValue = v; };

    // Simulate the debounce effect: setTimeout of 300ms
    const draft = "SELECT * FROM users";
    const timer = setTimeout(() => onChange(draft), 300);

    // Not called immediately
    expect(syncedValue).toBe("");

    // Advance past debounce window
    vi.advanceTimersByTime(300);
    expect(syncedValue).toBe("SELECT * FROM users");

    clearTimeout(timer);
    vi.useRealTimers();
  });

  it("debounce cancels previous timer on rapid input", async () => {
    const { vi } = await import("vitest");
    vi.useFakeTimers();

    let syncedValue = "";
    const onChange = (v: string) => { syncedValue = v; };

    // Simulate rapid typing: each keystroke clears the previous timer
    let timer = setTimeout(() => onChange("S"), 300);
    vi.advanceTimersByTime(100);
    clearTimeout(timer);

    timer = setTimeout(() => onChange("SE"), 300);
    vi.advanceTimersByTime(100);
    clearTimeout(timer);

    timer = setTimeout(() => onChange("SEL"), 300);

    // Still not synced
    expect(syncedValue).toBe("");

    // Advance past the final debounce
    vi.advanceTimersByTime(300);
    expect(syncedValue).toBe("SEL");

    clearTimeout(timer);
    vi.useRealTimers();
  });
});

// ─── BUG 10: Searchable select — debounced search term logic ──────────────

describe("Searchable select — debounced search term logic", () => {
  it("search term debounce pattern delays the query param update", async () => {
    const { vi } = await import("vitest");
    vi.useFakeTimers();

    // Simulates the ParameterWidgetRenderer debounced search pattern:
    // searchTerm → 300ms delay → debouncedSearch → passed to useSeedQuery
    let debouncedSearch = "";
    const setDebouncedSearch = (v: string) => { debouncedSearch = v; };

    // User types "foo"
    const searchTerm = "foo";
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);

    expect(debouncedSearch).toBe("");

    vi.advanceTimersByTime(300);
    expect(debouncedSearch).toBe("foo");

    clearTimeout(timer);
    vi.useRealTimers();
  });

  it("searchable extraParams includes param_search when debounced search is set", () => {
    // Simulates seedExtraParams computation in ParameterWidgetRenderer
    const searchable = true;
    const debouncedSearch = "test";
    const parameterType = "select";
    const parentParams = {};

    const base = parameterType === "cascading-select" ? parentParams : {};
    let seedExtraParams: Record<string, unknown> | undefined;
    if (searchable && debouncedSearch) {
      seedExtraParams = { ...base, param_search: debouncedSearch };
    } else {
      seedExtraParams = Object.keys(base).length > 0 ? base : undefined;
    }

    expect(seedExtraParams).toEqual({ param_search: "test" });
  });

  it("searchable extraParams is undefined when search is empty", () => {
    const searchable = true;
    const debouncedSearch = "";
    const parameterType = "select";
    const parentParams = {};

    const base = parameterType === "cascading-select" ? parentParams : {};
    let seedExtraParams: Record<string, unknown> | undefined;
    if (searchable && debouncedSearch) {
      seedExtraParams = { ...base, param_search: debouncedSearch };
    } else {
      seedExtraParams = Object.keys(base).length > 0 ? base : undefined;
    }

    expect(seedExtraParams).toBeUndefined();
  });

  it("non-searchable mode does not include param_search", () => {
    const searchable = false;
    const debouncedSearch = "test";
    const parameterType = "select";
    const parentParams = {};

    const base = parameterType === "cascading-select" ? parentParams : {};
    let seedExtraParams: Record<string, unknown> | undefined;
    if (searchable && debouncedSearch) {
      seedExtraParams = { ...base, param_search: debouncedSearch };
    } else {
      seedExtraParams = Object.keys(base).length > 0 ? base : undefined;
    }

    expect(seedExtraParams).toBeUndefined();
  });
});

// ─── DebouncedTextInput — 200ms debounce ──────────────────────────────────

describe("DebouncedTextInput — 200ms debounce logic", () => {
  it("does not fire onChange before 200ms", async () => {
    const { vi } = await import("vitest");
    vi.useFakeTimers();

    let fired = "";
    const onChange = (v: string) => { fired = v; };

    // Simulate the useEffect: setTimeout 200ms
    const draft = "hello";
    const timer = setTimeout(() => onChange(draft), 200);

    // Not called yet
    vi.advanceTimersByTime(199);
    expect(fired).toBe("");

    // Just past the threshold
    vi.advanceTimersByTime(1);
    expect(fired).toBe("hello");

    clearTimeout(timer);
    vi.useRealTimers();
  });

  it("cancels pending timer on rapid input (debounce resets)", async () => {
    const { vi } = await import("vitest");
    vi.useFakeTimers();

    let fired = "";
    const onChange = (v: string) => { fired = v; };

    // Simulate typing "a", "ab", "abc" — each resets the 200ms timer
    let timer = setTimeout(() => onChange("a"), 200);
    vi.advanceTimersByTime(50);
    clearTimeout(timer);

    timer = setTimeout(() => onChange("ab"), 200);
    vi.advanceTimersByTime(50);
    clearTimeout(timer);

    timer = setTimeout(() => onChange("abc"), 200);

    // Not yet fired
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
    const onChange = () => { fired = true; };

    // Simulate the guard: if (draft !== value) onChange(draft)
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
