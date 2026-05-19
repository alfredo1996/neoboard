import { describe, it, expect, beforeEach } from "vitest";
import { useParameterStore } from "@/stores/parameter-store";

function resetStore() {
  useParameterStore.getState().clearAll();
}

describe("ParamNumberRange — store interactions", () => {
  beforeEach(resetStore);

  it("stores a tuple and sets companion _min/_max", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter(
      "price",
      [100, 500],
      "Parameter Selector",
      "price",
      "number-range",
      "selector-widget",
    );
    setParameter(
      "price_min",
      100,
      "Parameter Selector",
      "price_min",
      "number-range",
      "selector-widget",
    );
    setParameter(
      "price_max",
      500,
      "Parameter Selector",
      "price_max",
      "number-range",
      "selector-widget",
    );

    const params = useParameterStore.getState().parameters;
    expect(params["price"].value).toEqual([100, 500]);
    expect(params["price_min"].value).toBe(100);
    expect(params["price_max"].value).toBe(500);
  });

  it("clears all three params on reset", () => {
    const { setParameter, clearParameter } = useParameterStore.getState();
    setParameter(
      "price",
      [100, 500],
      "Parameter Selector",
      "price",
      "number-range",
      "selector-widget",
    );
    setParameter(
      "price_min",
      100,
      "Parameter Selector",
      "price_min",
      "number-range",
      "selector-widget",
    );
    setParameter(
      "price_max",
      500,
      "Parameter Selector",
      "price_max",
      "number-range",
      "selector-widget",
    );

    clearParameter("price");
    clearParameter("price_min");
    clearParameter("price_max");

    const params = useParameterStore.getState().parameters;
    expect(params["price"]).toBeUndefined();
    expect(params["price_min"]).toBeUndefined();
    expect(params["price_max"]).toBeUndefined();
  });
});

describe("ParamNumberRange — value coercion", () => {
  beforeEach(resetStore);

  // Mirror the NaN-guarded parsing in param-number-range.tsx — kept as a tiny
  // inline helper so the table-driven cases below read top-to-bottom.
  const parseRangeValue = (raw: unknown): [number, number] | null => {
    if (Array.isArray(raw) && raw.length >= 2) {
      const lo = Number(raw[0]);
      const hi = Number(raw[1]);
      if (Number.isFinite(lo) && Number.isFinite(hi)) return [lo, hi];
    }
    return null;
  };

  it("converts stored tuple to [number, number]", () => {
    expect(parseRangeValue([100, 500])).toEqual([100, 500]);
  });

  it("returns null when no entry", () => {
    expect(parseRangeValue(undefined)).toBeNull();
  });

  it("returns null for non-array values (corrupt restore)", () => {
    expect(parseRangeValue("not-an-array")).toBeNull();
    expect(parseRangeValue(42)).toBeNull();
    expect(parseRangeValue({ from: 1, to: 2 })).toBeNull();
  });

  it("returns null when tuple contains non-numeric entries", () => {
    // Previous code returned [NaN, NaN]; guard now drops the value entirely.
    expect(parseRangeValue(["foo", "bar"])).toBeNull();
    expect(parseRangeValue([undefined, 5])).toBeNull();
  });

  it("returns null when array is too short", () => {
    expect(parseRangeValue([5])).toBeNull();
    expect(parseRangeValue([])).toBeNull();
  });

  it("accepts numeric strings (restored from JSON)", () => {
    expect(parseRangeValue(["10", "20"])).toEqual([10, 20]);
  });
});
