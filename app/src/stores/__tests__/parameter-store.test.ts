import { describe, it, expect, beforeEach } from "vitest";
import { useParameterStore } from "../parameter-store";
import type { ParameterType, ParameterSource } from "../parameter-store";

function resetStore() {
  useParameterStore.getState().clearAll();
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
});
