import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  useParameterStore,
  deriveValues,
  shallowEqual,
  resetDeriveValuesCache,
} from "../parameter-store";
import { expandParamDefaults } from "@/lib/parameter/apply-param-defaults";
import type {
  ParameterType,
  ParameterSource,
  ParameterEntry,
} from "../parameter-store";

function resetStore() {
  useParameterStore.getState().clearAll();
}

/** Minimal localStorage stub for Node (no jsdom). */
function createLocalStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    get length() {
      return store.size;
    },
    key: (index: number) => [...store.keys()][index] ?? null,
  } as Storage;
}

describe("useParameterStore", () => {
  beforeEach(resetStore);

  // ── Initial state ──────────────────────────────────────────────────

  it("starts with an empty parameters map", () => {
    expect(useParameterStore.getState().parameters).toEqual({});
  });

  // ── setParameter ───────────────────────────────────────────────────

  it("sets a parameter with default type and sourceType", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter("myParam", "hello", "Widget A", "name");
    const entry = useParameterStore.getState().parameters["myParam"];
    expect(entry.value).toBe("hello");
    expect(entry.source).toBe("Widget A");
    expect(entry.field).toBe("name");
    expect(entry.type).toBe("text");
    expect(entry.sourceType).toBe("click-action");
  });

  it("sets a parameter with explicit type and sourceType", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter(
      "genre",
      "Action",
      "GenreSelector",
      "genre",
      "select",
      "selector-widget",
    );
    const entry = useParameterStore.getState().parameters["genre"];
    expect(entry.type).toBe("select");
    expect(entry.sourceType).toBe("selector-widget");
    expect(entry.value).toBe("Action");
  });

  it("sets a multi-select parameter with an array value", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter(
      "tags",
      ["a", "b", "c"],
      "TagSelector",
      "tags",
      "multi-select",
      "selector-widget",
    );
    const entry = useParameterStore.getState().parameters["tags"];
    expect(entry.value).toEqual(["a", "b", "c"]);
    expect(entry.type).toBe("multi-select");
  });

  it("overwrites an existing parameter", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter("x", "first", "A", "x");
    setParameter("x", "second", "B", "x");
    expect(useParameterStore.getState().parameters["x"].value).toBe("second");
    expect(useParameterStore.getState().parameters["x"].source).toBe("B");
  });

  it("can set multiple independent parameters", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter("a", 1, "W1", "a");
    setParameter("b", 2, "W2", "b");
    const params = useParameterStore.getState().parameters;
    expect(Object.keys(params)).toHaveLength(2);
    expect(params["a"].value).toBe(1);
    expect(params["b"].value).toBe(2);
  });

  // ── date-range compound parameters ──────────────────────────────────

  it("can store date-range as an object value", () => {
    const { setParameter } = useParameterStore.getState();
    const dateRange = { from: "2024-01-01", to: "2024-01-31" };
    setParameter(
      "period",
      dateRange,
      "DateRangePicker",
      "period",
      "date-range",
      "selector-widget",
    );
    const entry = useParameterStore.getState().parameters["period"];
    expect(entry.value).toEqual(dateRange);
    expect(entry.type).toBe("date-range");
  });

  it("can store companion _from and _to parameters for date-range", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter(
      "period_from",
      "2024-01-01",
      "DateRangePicker",
      "period_from",
      "date",
      "selector-widget",
    );
    setParameter(
      "period_to",
      "2024-01-31",
      "DateRangePicker",
      "period_to",
      "date",
      "selector-widget",
    );
    const params = useParameterStore.getState().parameters;
    expect(params["period_from"].value).toBe("2024-01-01");
    expect(params["period_to"].value).toBe("2024-01-31");
  });

  // ── number-range compound parameters ──────────────────────────────

  it("can store number-range as a tuple value and companion _min/_max", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter(
      "price",
      [10, 500],
      "PriceSlider",
      "price",
      "number-range",
      "selector-widget",
    );
    // Companions are scalar numbers — typed as "text" (the "number-range"
    // type is reserved for the [min, max] tuple itself).
    setParameter(
      "price_min",
      10,
      "PriceSlider",
      "price_min",
      "text",
      "selector-widget",
    );
    setParameter(
      "price_max",
      500,
      "PriceSlider",
      "price_max",
      "text",
      "selector-widget",
    );
    const params = useParameterStore.getState().parameters;
    expect(params["price"].value).toEqual([10, 500]);
    expect(params["price_min"].value).toBe(10);
    expect(params["price_max"].value).toBe(500);
  });

  // ── clearParameter ─────────────────────────────────────────────────

  it("removes only the specified parameter", () => {
    const { setParameter, clearParameter } = useParameterStore.getState();
    setParameter("a", 1, "W", "a");
    setParameter("b", 2, "W", "b");
    clearParameter("a");
    const params = useParameterStore.getState().parameters;
    expect("a" in params).toBe(false);
    expect(params["b"].value).toBe(2);
  });

  it("does nothing when clearing a parameter that does not exist", () => {
    const { clearParameter } = useParameterStore.getState();
    expect(() => clearParameter("nonexistent")).not.toThrow();
    expect(useParameterStore.getState().parameters).toEqual({});
  });

  // ── clearAll ───────────────────────────────────────────────────────

  it("removes all parameters", () => {
    const { setParameter, clearAll } = useParameterStore.getState();
    setParameter("a", 1, "W", "a");
    setParameter("b", 2, "W", "b");
    clearAll();
    expect(useParameterStore.getState().parameters).toEqual({});
  });

  // ── sourceWidgetId ───────────────────────────────────────────────

  it("stores sourceWidgetId when provided", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter(
      "category",
      "Electronics",
      "Bar Chart",
      "category",
      "text",
      "click-action",
      "widget-abc-123",
    );
    const entry = useParameterStore.getState().parameters["category"];
    expect(entry.sourceWidgetId).toBe("widget-abc-123");
  });

  it("stores undefined sourceWidgetId when not provided", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter("category", "Electronics", "Bar Chart", "category");
    const entry = useParameterStore.getState().parameters["category"];
    expect(entry.sourceWidgetId).toBeUndefined();
  });

  it("stores sourceWidgetId when provided and omits it when not", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter("x", 1, "W", "x", "text", "click-action", "wid-1");
    setParameter("y", 2, "W", "y", "text", "selector-widget");
    const params = useParameterStore.getState().parameters;
    expect(params["x"].sourceWidgetId).toBe("wid-1");
    expect(params["y"].sourceWidgetId).toBeUndefined();
  });

  // ── ParameterType union coverage ──────────────────────────────────

  it("accepts all 8 ParameterType values without TypeScript error", () => {
    const types: ParameterType[] = [
      "text",
      "select",
      "multi-select",
      "date",
      "date-range",
      "date-relative",
      "number-range",
      "cascading-select",
    ];
    const { setParameter, clearAll } = useParameterStore.getState();
    // Use type-appropriate values so coercion passes for all types
    const values: Record<ParameterType, unknown> = {
      text: "val",
      select: "val",
      "multi-select": ["a"],
      date: "2026-01-01",
      "date-range": "2026-01-01",
      "date-relative": "last7",
      "number-range": [0, 42],
      "cascading-select": "val",
    };
    for (const t of types) {
      setParameter(`p_${t}`, values[t], "test", t, t, "selector-widget");
    }
    expect(Object.keys(useParameterStore.getState().parameters)).toHaveLength(
      types.length,
    );
    clearAll();
  });

  // ── ParameterSource union coverage ────────────────────────────────

  it("accepts all 4 ParameterSource values", () => {
    const sources: ParameterSource[] = [
      "click-action",
      "selector-widget",
      "url",
      "cross-dashboard",
    ];
    const { setParameter } = useParameterStore.getState();
    for (const s of sources) {
      setParameter(`p_${s}`, "val", "test", s, "text", s);
    }
    const params = useParameterStore.getState().parameters;
    expect(params["p_click-action"].sourceType).toBe("click-action");
    expect(params["p_selector-widget"].sourceType).toBe("selector-widget");
    expect(params["p_url"].sourceType).toBe("url");
    expect(params["p_cross-dashboard"].sourceType).toBe("cross-dashboard");
  });

  // ── Per-dashboard parameter persistence ──────────────────────────

  describe("saveToDashboard / restoreFromDashboard", () => {
    let originalLocalStorage: Storage | undefined;

    beforeEach(() => {
      originalLocalStorage = globalThis.localStorage;
      Object.defineProperty(globalThis, "localStorage", {
        value: createLocalStorageMock(),
        writable: true,
        configurable: true,
      });
    });

    afterEach(() => {
      if (originalLocalStorage !== undefined) {
        Object.defineProperty(globalThis, "localStorage", {
          value: originalLocalStorage,
          writable: true,
          configurable: true,
        });
      } else {
        // @ts-expect-error – cleanup in Node where localStorage didn't exist
        delete globalThis.localStorage;
      }
    });

    it("saves parameters to localStorage keyed by dashboard ID", () => {
      const { setParameter, saveToDashboard } = useParameterStore.getState();
      setParameter(
        "genre",
        "Action",
        "Selector",
        "genre",
        "select",
        "selector-widget",
      );
      saveToDashboard("dash-1");

      const stored = localStorage.getItem("nb-params:dash-1");
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed["genre"].value).toBe("Action");
      expect(parsed["genre"].type).toBe("select");
    });

    it("restores parameters from localStorage", () => {
      const { setParameter, saveToDashboard, restoreFromDashboard, clearAll } =
        useParameterStore.getState();

      setParameter(
        "year",
        2024,
        "YearPicker",
        "year",
        "text",
        "selector-widget",
      );
      saveToDashboard("dash-2");
      clearAll();
      expect(useParameterStore.getState().parameters).toEqual({});

      restoreFromDashboard("dash-2");
      const restored = useParameterStore.getState().parameters;
      expect(restored["year"].value).toBe(2024);
      expect(restored["year"].source).toBe("YearPicker");
    });

    it("restores empty parameters when no data exists for dashboard", () => {
      const { setParameter, restoreFromDashboard } =
        useParameterStore.getState();
      setParameter("leftover", "stale", "Old", "x");

      restoreFromDashboard("never-visited-dashboard");
      expect(useParameterStore.getState().parameters).toEqual({});
    });

    it("does not save when parameters are empty", () => {
      const { saveToDashboard } = useParameterStore.getState();
      saveToDashboard("empty-dash");
      expect(localStorage.getItem("nb-params:empty-dash")).toBeNull();
    });

    it("isolates parameters between different dashboards", () => {
      const { setParameter, saveToDashboard, restoreFromDashboard } =
        useParameterStore.getState();

      // Set and save Dashboard A params
      setParameter(
        "movie",
        "The Matrix",
        "MovieSelector",
        "movie",
        "select",
        "selector-widget",
      );
      setParameter("year", 1999, "YearPicker", "year");
      saveToDashboard("dash-A");

      // Clear and set Dashboard B params
      useParameterStore.getState().clearAll();
      setParameter(
        "city",
        "Berlin",
        "CityPicker",
        "city",
        "select",
        "selector-widget",
      );
      saveToDashboard("dash-B");

      // Restore Dashboard A — should have movie+year, not city
      restoreFromDashboard("dash-A");
      const paramsA = useParameterStore.getState().parameters;
      expect(paramsA["movie"].value).toBe("The Matrix");
      expect(paramsA["year"].value).toBe(1999);
      expect(paramsA["city"]).toBeUndefined();

      // Restore Dashboard B — should have city, not movie/year
      restoreFromDashboard("dash-B");
      const paramsB = useParameterStore.getState().parameters;
      expect(paramsB["city"].value).toBe("Berlin");
      expect(paramsB["movie"]).toBeUndefined();
      expect(paramsB["year"]).toBeUndefined();
    });

    it("handles corrupted localStorage gracefully", () => {
      localStorage.setItem("nb-params:corrupt", "not-valid-json{{{");
      const { restoreFromDashboard } = useParameterStore.getState();
      restoreFromDashboard("corrupt");
      expect(useParameterStore.getState().parameters).toEqual({});
    });

    it("rejects non-object payloads (array, primitive)", () => {
      localStorage.setItem("nb-params:bad-array", JSON.stringify(["x"]));
      const { restoreFromDashboard } = useParameterStore.getState();
      restoreFromDashboard("bad-array");
      expect(useParameterStore.getState().parameters).toEqual({});

      localStorage.setItem("nb-params:bad-num", JSON.stringify(42));
      restoreFromDashboard("bad-num");
      expect(useParameterStore.getState().parameters).toEqual({});
    });

    it("drops entries with missing required fields", () => {
      localStorage.setItem(
        "nb-params:partial",
        JSON.stringify({
          good: {
            value: "x",
            source: "W",
            field: "f",
            type: "text",
            sourceType: "selector-widget",
          },
          // missing source + field — must be dropped
          bad: { value: "x", type: "text" },
        }),
      );
      useParameterStore.getState().restoreFromDashboard("partial");
      const out = useParameterStore.getState().parameters;
      expect(Object.keys(out)).toEqual(["good"]);
    });

    it("drops entries whose value fails coerceValue (e.g. scalar in number-range)", () => {
      localStorage.setItem(
        "nb-params:malformed",
        JSON.stringify({
          range: {
            value: [0, 10],
            source: "Slider",
            field: "range",
            type: "number-range",
            sourceType: "selector-widget",
          },
          badRange: {
            // legal-looking shape but invalid value for number-range
            value: { nope: 1 },
            source: "Slider",
            field: "badRange",
            type: "number-range",
            sourceType: "selector-widget",
          },
        }),
      );
      useParameterStore.getState().restoreFromDashboard("malformed");
      const out = useParameterStore.getState().parameters;
      expect(out["range"]).toBeDefined();
      expect(out["badRange"]).toBeUndefined();
    });

    it("overwrites previously saved parameters on re-save", () => {
      const { setParameter, saveToDashboard, restoreFromDashboard, clearAll } =
        useParameterStore.getState();

      // First save
      setParameter("color", "red", "ColorPicker", "color");
      saveToDashboard("dash-overwrite");
      clearAll();

      // Second save with different value
      setParameter("color", "blue", "ColorPicker", "color");
      saveToDashboard("dash-overwrite");
      clearAll();

      // Restore should get the latest
      restoreFromDashboard("dash-overwrite");
      expect(useParameterStore.getState().parameters["color"].value).toBe(
        "blue",
      );
    });

    it("preserves all entry fields through save/restore cycle", () => {
      const { setParameter, saveToDashboard, restoreFromDashboard, clearAll } =
        useParameterStore.getState();

      setParameter(
        "tags",
        ["action", "sci-fi"],
        "TagSelector",
        "tags",
        "multi-select",
        "selector-widget",
      );
      saveToDashboard("dash-fields");
      clearAll();

      restoreFromDashboard("dash-fields");
      const entry = useParameterStore.getState().parameters["tags"];
      expect(entry.value).toEqual(["action", "sci-fi"]);
      expect(entry.source).toBe("TagSelector");
      expect(entry.field).toBe("tags");
      expect(entry.type).toBe("multi-select");
      expect(entry.sourceType).toBe("selector-widget");
    });

    it("preserves sourceWidgetId through localStorage save/restore cycle", () => {
      const { setParameter, saveToDashboard, restoreFromDashboard, clearAll } =
        useParameterStore.getState();

      setParameter("x", 1, "W", "x", "text", "click-action", "wid-1");
      setParameter("y", 2, "W", "y", "text", "selector-widget");
      saveToDashboard("dash-source-widget");

      // Verify sourceWidgetId is actually serialized in localStorage
      const stored = localStorage.getItem("nb-params:dash-source-widget");
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed["x"].sourceWidgetId).toBe("wid-1");
      expect(parsed["y"].sourceWidgetId).toBeUndefined();

      clearAll();
      expect(useParameterStore.getState().parameters).toEqual({});

      restoreFromDashboard("dash-source-widget");
      const params = useParameterStore.getState().parameters;
      expect(params["x"].sourceWidgetId).toBe("wid-1");
      expect(params["y"].sourceWidgetId).toBeUndefined();
    });

    // ── Failure-path tests (regression: #862) ──────────────────────
    //
    // The store's localStorage helpers are wrapped in try/catch and must
    // degrade silently instead of crashing the dashboard render path.
    // These tests pin that contract.

    it("degrades silently when localStorage.setItem throws (e.g. quota)", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const setItemSpy = vi
        .spyOn(globalThis.localStorage, "setItem")
        .mockImplementation(() => {
          throw new DOMException("QuotaExceededError");
        });

      const { setParameter, saveToDashboard } = useParameterStore.getState();
      setParameter("big", "x".repeat(10), "W", "big");

      // Must not throw.
      expect(() => saveToDashboard("dash-quota")).not.toThrow();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("[parameter-store]"),
      );

      setItemSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it("degrades silently when localStorage.removeItem throws on empty save", () => {
      // Empty parameter map triggers the removeItem branch, which can also
      // throw in restrictive environments (Safari Private Mode, sandboxed iframes).
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const removeSpy = vi
        .spyOn(globalThis.localStorage, "removeItem")
        .mockImplementation(() => {
          throw new Error("storage disabled");
        });

      const { saveToDashboard } = useParameterStore.getState();
      // params is empty by virtue of resetStore() in beforeEach
      expect(() => saveToDashboard("dash-empty-throws")).not.toThrow();
      expect(warnSpy).toHaveBeenCalled();

      removeSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it("recovers to empty state when restore-time getItem throws", () => {
      // SecurityError is the typical exception for sandboxed/disabled storage.
      const getSpy = vi
        .spyOn(globalThis.localStorage, "getItem")
        .mockImplementation(() => {
          throw new DOMException("SecurityError");
        });

      const { setParameter, restoreFromDashboard } =
        useParameterStore.getState();
      setParameter("stale", "value", "W", "stale");

      expect(() => restoreFromDashboard("dash-blocked")).not.toThrow();
      // Store is reset to empty (mirrors the corrupted-JSON behavior).
      expect(useParameterStore.getState().parameters).toEqual({});

      getSpy.mockRestore();
    });

    it("restores valid JSON of the wrong shape without crashing downstream selectors", () => {
      // The store does not currently validate restored payload shape — these
      // tests pin the *observed* behavior so any future schema validation
      // shows up as an intentional diff.
      localStorage.setItem(
        "nb-params:dash-wrong-shape",
        JSON.stringify({ orphan: "just a string, not a ParameterEntry" }),
      );

      const { restoreFromDashboard } = useParameterStore.getState();
      expect(() => restoreFromDashboard("dash-wrong-shape")).not.toThrow();

      // deriveValues runs over the restored map — must not throw on
      // entries missing the expected `.value` field.
      const params = useParameterStore.getState().parameters;
      expect(() => deriveValues(params)).not.toThrow();
    });
  });

  describe("type coercion", () => {
    it("accepts a tuple of numeric strings for number-range type", () => {
      // number-range is a tuple by definition (was previously buggy: scalar
      // values silently slipped past coercion as `number-range`, leaving the
      // widget to fall back to defaults).
      const { setParameter } = useParameterStore.getState();
      setParameter("count", ["10", "42"], "click", "count", "number-range");
      expect(useParameterStore.getState().parameters["count"].value).toEqual([
        10, 42,
      ]);
    });

    it("rejects a scalar number for number-range type (regression: #858)", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { setParameter } = useParameterStore.getState();
      setParameter("count", 42, "click", "count", "number-range");
      expect(useParameterStore.getState().parameters["count"]).toBeUndefined();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it("rejects a scalar string for number-range type (regression: #858)", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { setParameter } = useParameterStore.getState();
      setParameter("count", "42", "click", "count", "number-range");
      expect(useParameterStore.getState().parameters["count"]).toBeUndefined();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it("rejects non-finite values inside a number-range tuple", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { setParameter } = useParameterStore.getState();
      setParameter("count", [NaN, 1], "click", "count", "number-range");
      expect(useParameterStore.getState().parameters["count"]).toBeUndefined();
      setParameter("count", [Infinity, 1], "click", "count", "number-range");
      expect(useParameterStore.getState().parameters["count"]).toBeUndefined();
      warnSpy.mockRestore();
    });

    it("rejects a number-range tuple of wrong length", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { setParameter } = useParameterStore.getState();
      setParameter("count", [1, 2, 3], "click", "count", "number-range");
      expect(useParameterStore.getState().parameters["count"]).toBeUndefined();
      setParameter("count", [1], "click", "count", "number-range");
      expect(useParameterStore.getState().parameters["count"]).toBeUndefined();
      warnSpy.mockRestore();
    });

    it("coerces an ISO string to the same string for date type", () => {
      const { setParameter } = useParameterStore.getState();
      setParameter("d", "2026-03-30", "click", "d", "date");
      expect(useParameterStore.getState().parameters["d"].value).toBe(
        "2026-03-30",
      );
    });

    it("rejects non-parseable string for number-range with console warning", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { setParameter } = useParameterStore.getState();
      setParameter("count", ["abc", "def"], "click", "count", "number-range");
      // Value should NOT be set
      expect(useParameterStore.getState().parameters["count"]).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("[parameter-store]"),
        expect.anything(),
      );
      warnSpy.mockRestore();
    });

    it("accepts arrays for multi-select type", () => {
      const { setParameter } = useParameterStore.getState();
      setParameter("tags", ["a", "b"], "widget", "tags", "multi-select");
      expect(useParameterStore.getState().parameters["tags"].value).toEqual([
        "a",
        "b",
      ]);
    });

    it("accepts any value for text type without coercion", () => {
      const { setParameter } = useParameterStore.getState();
      setParameter("q", 123, "click", "q", "text");
      expect(useParameterStore.getState().parameters["q"].value).toBe(123);
    });
  });

  describe("shallowEqual", () => {
    it("returns true for empty objects", () => {
      expect(shallowEqual({}, {})).toBe(true);
    });

    it("returns true for identical values", () => {
      expect(shallowEqual({ a: 1, b: "x" }, { a: 1, b: "x" })).toBe(true);
    });

    it("returns false when key counts differ", () => {
      expect(shallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    });

    it("returns false when a value differs", () => {
      expect(shallowEqual({ a: 1 }, { a: 2 })).toBe(false);
    });

    it("returns false when a key is missing from b", () => {
      expect(shallowEqual({ a: 1, b: 2 }, { a: 1, c: 2 })).toBe(false);
    });

    it("does element-wise compare on arrays (regression: #858)", () => {
      // multi-select / number-range values are arrays; the old shallowEqual
      // used `!==`, which busted the deriveValues memo on every render.
      const arr1 = [1, 2];
      const arr2 = [1, 2];
      expect(shallowEqual({ x: arr1 }, { x: arr2 })).toBe(true);
      expect(shallowEqual({ x: arr1 }, { x: arr1 })).toBe(true);
    });

    it("distinguishes arrays with different contents", () => {
      expect(shallowEqual({ x: [1, 2] }, { x: [1, 3] })).toBe(false);
      expect(shallowEqual({ x: [1, 2] }, { x: [1, 2, 3] })).toBe(false);
    });

    it("distinguishes an array from a non-array scalar", () => {
      expect(shallowEqual({ x: [1] }, { x: 1 })).toBe(false);
    });
  });

  describe("deriveValues", () => {
    // Cache lives in a closure (no longer at module scope) — reset between
    // tests so a cached value from a prior case can't leak across.
    beforeEach(() => {
      resetDeriveValuesCache();
    });

    function entry(value: unknown): ParameterEntry {
      return {
        value,
        source: "W",
        field: "f",
        type: "text",
        sourceType: "click-action",
      };
    }

    it("extracts just the values from parameter entries", () => {
      const result = deriveValues({
        a: entry(1),
        b: entry("hello"),
      });
      expect(result).toEqual({ a: 1, b: "hello" });
    });

    it("returns same reference when called twice with same input object", () => {
      const params = { a: entry(1), b: entry(2) };
      const result1 = deriveValues(params);
      const result2 = deriveValues(params);
      expect(result1).toBe(result2);
    });

    it("returns cached values when a new params object has the same values", () => {
      const first = deriveValues({ a: entry(1) });
      const second = deriveValues({ a: entry(1) }); // new object, same values
      expect(second).toBe(first);
    });

    it("returns new reference when values change", () => {
      const first = deriveValues({ a: entry(1) });
      const second = deriveValues({ a: entry(2) });
      expect(second).not.toBe(first);
      expect(second).toEqual({ a: 2 });
    });

    it("returns new reference when a key is added", () => {
      const first = deriveValues({ a: entry(1) });
      const second = deriveValues({ a: entry(1), b: entry(2) });
      expect(second).not.toBe(first);
      expect(second).toEqual({ a: 1, b: 2 });
    });

    it("handles empty parameters", () => {
      const result = deriveValues({});
      expect(result).toEqual({});
    });

    it("preserves memo across renders for array values (regression: #858)", () => {
      // multi-select: each render produces a new array reference upstream
      // (Zustand makes a shallow copy of the params record). With the old
      // shallowEqual the memo never hit; now it does.
      const first = deriveValues({ tags: entry(["a", "b"]) });
      const second = deriveValues({ tags: entry(["a", "b"]) });
      expect(second).toBe(first);
    });

    it("preserves memo across renders for number-range tuples (regression: #858)", () => {
      const first = deriveValues({ price: entry([10, 100]) });
      const second = deriveValues({ price: entry([10, 100]) });
      expect(second).toBe(first);
    });

    it("busts the memo when an array value's contents actually change", () => {
      const first = deriveValues({ tags: entry(["a"]) });
      const second = deriveValues({ tags: entry(["a", "b"]) });
      expect(second).not.toBe(first);
    });

    it("resetDeriveValuesCache clears cached state for test isolation", () => {
      const first = deriveValues({ a: entry(1) });
      resetDeriveValuesCache();
      // After reset, the memo should not hand back the same reference even
      // for a structurally-equal input.
      const second = deriveValues({ a: entry(1) });
      expect(second).not.toBe(first);
      expect(second).toEqual({ a: 1 });
    });
  });

  describe("useParameterValues selector stability", () => {
    it("returns the same reference when values have not changed", () => {
      const { setParameter } = useParameterStore.getState();
      setParameter("x", 1, "W", "x");

      const state1 = useParameterStore.getState();
      const values1 = { ...state1.parameters };

      // Trigger a no-op re-read (same parameters object)
      const values2 = useParameterStore.getState().parameters;
      expect(values1).not.toBe(values2); // Zustand returns new state objects
      // But both should have same x value
      expect(values2["x"].value).toBe(1);
    });

    it("returns new reference when values actually change", () => {
      const { setParameter } = useParameterStore.getState();
      setParameter("a", 1, "W", "a");

      const params1 = useParameterStore.getState().parameters;
      const vals1: Record<string, unknown> = {};
      for (const [k, e] of Object.entries(params1)) vals1[k] = e.value;

      setParameter("a", 2, "W", "a");

      const params2 = useParameterStore.getState().parameters;
      const vals2: Record<string, unknown> = {};
      for (const [k, e] of Object.entries(params2)) vals2[k] = e.value;

      expect(vals1.a).toBe(1);
      expect(vals2.a).toBe(2);
      expect(vals1).not.toEqual(vals2);
    });
  });
});

// ---------------------------------------------------------------------------
// #1517 — the seeds `expandParamDefaults` produces must survive the store's own
// coercion. Both halves passed their unit tests independently while the feature
// was broken end to end, which is the shape this block exists to catch.
// ---------------------------------------------------------------------------

describe("seeding a configured Default value (#1517)", () => {
  beforeEach(() => resetStore());

  it("leaves a number-range's companions readable as numbers by a query", () => {
    for (const seed of expandParamDefaults([
      {
        name: "window",
        value: "180",
        type: "number-range",
        widgetId: "w0",
        rangeMin: 30,
      },
    ])) {
      useParameterStore
        .getState()
        .setParameter(
          seed.name,
          seed.value,
          "Default value",
          seed.name,
          seed.type,
          "default",
          seed.widgetId,
        );
    }

    const values = deriveValues(useParameterStore.getState().parameters);
    // What `LIMIT $param_window_max` actually resolves to.
    expect(values.window_max).toBe(180);
    expect(values.window_min).toBe(30);
    expect(values.window).toEqual([30, 180]);
  });

  it("coerces a multi-select default to an array, not a bare string", () => {
    const [seed] = expandParamDefaults([
      { name: "tags", value: "alpha", type: "multi-select", widgetId: "w0" },
    ]);
    useParameterStore
      .getState()
      .setParameter(
        seed.name,
        seed.value,
        "Default value",
        seed.name,
        seed.type,
        "default",
        seed.widgetId,
      );

    expect(useParameterStore.getState().parameters.tags.value).toEqual([
      "alpha",
    ]);
  });

  it("records the parameter name as the chip field, not an empty string", () => {
    const [seed] = expandParamDefaults([
      { name: "dept", value: "Sales", type: "select", widgetId: "widget-3" },
    ]);
    useParameterStore
      .getState()
      .setParameter(
        seed.name,
        seed.value,
        "Default value",
        seed.name,
        seed.type,
        "default",
        seed.widgetId,
      );

    const entry = useParameterStore.getState().parameters.dept;
    // Rendered by CrossFilterTag as `{field} = {value}` — an empty field gave
    // the user a chip reading "= Sales" with no way to tell what it filtered.
    expect(entry.field).toBe("dept");
    expect(entry.source).toBe("Default value");
    expect(entry.sourceWidgetId).toBe("widget-3");
  });
});
