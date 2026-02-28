import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { useParameterStore } from "../parameter-store";
import type { ParameterType, ParameterSource } from "../parameter-store";

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
    setParameter("genre", "Action", "GenreSelector", "genre", "select", "selector-widget");
    const entry = useParameterStore.getState().parameters["genre"];
    expect(entry.type).toBe("select");
    expect(entry.sourceType).toBe("selector-widget");
    expect(entry.value).toBe("Action");
  });

  it("sets a multi-select parameter with an array value", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter("tags", ["a", "b", "c"], "TagSelector", "tags", "multi-select", "selector-widget");
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
    setParameter("period", dateRange, "DateRangePicker", "period", "date-range", "selector-widget");
    const entry = useParameterStore.getState().parameters["period"];
    expect(entry.value).toEqual(dateRange);
    expect(entry.type).toBe("date-range");
  });

  it("can store companion _from and _to parameters for date-range", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter("period_from", "2024-01-01", "DateRangePicker", "period_from", "date", "selector-widget");
    setParameter("period_to", "2024-01-31", "DateRangePicker", "period_to", "date", "selector-widget");
    const params = useParameterStore.getState().parameters;
    expect(params["period_from"].value).toBe("2024-01-01");
    expect(params["period_to"].value).toBe("2024-01-31");
  });

  // ── number-range compound parameters ──────────────────────────────

  it("can store number-range as a tuple value and companion _min/_max", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter("price", [10, 500], "PriceSlider", "price", "number-range", "selector-widget");
    setParameter("price_min", 10, "PriceSlider", "price_min", "number-range", "selector-widget");
    setParameter("price_max", 500, "PriceSlider", "price_max", "number-range", "selector-widget");
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
    for (const t of types) {
      setParameter(`p_${t}`, "val", "test", t, t, "selector-widget");
    }
    expect(Object.keys(useParameterStore.getState().parameters)).toHaveLength(types.length);
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
      setParameter("genre", "Action", "Selector", "genre", "select", "selector-widget");
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

      setParameter("year", 2024, "YearPicker", "year", "text", "selector-widget");
      saveToDashboard("dash-2");
      clearAll();
      expect(useParameterStore.getState().parameters).toEqual({});

      restoreFromDashboard("dash-2");
      const restored = useParameterStore.getState().parameters;
      expect(restored["year"].value).toBe(2024);
      expect(restored["year"].source).toBe("YearPicker");
    });

    it("restores empty parameters when no data exists for dashboard", () => {
      const { setParameter, restoreFromDashboard } = useParameterStore.getState();
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
      setParameter("movie", "The Matrix", "MovieSelector", "movie", "select", "selector-widget");
      setParameter("year", 1999, "YearPicker", "year");
      saveToDashboard("dash-A");

      // Clear and set Dashboard B params
      useParameterStore.getState().clearAll();
      setParameter("city", "Berlin", "CityPicker", "city", "select", "selector-widget");
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
      expect(useParameterStore.getState().parameters["color"].value).toBe("blue");
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
        "selector-widget"
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
  });
});
