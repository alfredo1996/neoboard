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
    // Companions are scalar numbers — typed as "text" (matches the
    // contract enforced in param-number-range.tsx).
    setParameter(
      "price_min",
      100,
      "Parameter Selector",
      "price_min",
      "text",
      "selector-widget",
    );
    setParameter(
      "price_max",
      500,
      "Parameter Selector",
      "price_max",
      "text",
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
      "text",
      "selector-widget",
    );
    setParameter(
      "price_max",
      500,
      "Parameter Selector",
      "price_max",
      "text",
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

  it("converts stored tuple to [number, number]", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter(
      "price",
      [100, 500],
      "Parameter Selector",
      "price",
      "number-range",
      "selector-widget",
    );
    const currentEntry = useParameterStore.getState().parameters["price"];
    const rawRange = currentEntry?.value;
    const rangeValue: [number, number] | null = Array.isArray(rawRange)
      ? [Number(rawRange[0]), Number(rawRange[1])]
      : null;
    expect(rangeValue).toEqual([100, 500]);
  });

  it("returns null when no entry", () => {
    const currentEntry = useParameterStore.getState().parameters["price"];
    const rawRange = currentEntry?.value;
    const rangeValue: [number, number] | null = Array.isArray(rawRange)
      ? [Number(rawRange[0]), Number(rawRange[1])]
      : null;
    expect(rangeValue).toBeNull();
  });

  // Regression: NaN-guard on read. Mirrors the parser in
  // ParamNumberRange so a corrupted tuple cannot become [NaN, NaN] and
  // crash the slider downstream.
  function parseRangeValue(raw: unknown): [number, number] | null {
    if (!Array.isArray(raw) || raw.length < 2) return null;
    const lo = Number(raw[0]);
    const hi = Number(raw[1]);
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
    return [lo, hi];
  }

  it("returns null for a non-array stored value", () => {
    expect(parseRangeValue("100")).toBeNull();
    expect(parseRangeValue(42)).toBeNull();
    expect(parseRangeValue(undefined)).toBeNull();
  });

  it("returns null for a too-short tuple", () => {
    expect(parseRangeValue([100])).toBeNull();
  });

  it("returns null when either entry is non-numeric", () => {
    expect(parseRangeValue([undefined, 5])).toBeNull();
    expect(parseRangeValue([1, "x"])).toBeNull();
    expect(parseRangeValue(["x", "y"])).toBeNull();
  });

  it("coerces numeric strings", () => {
    expect(parseRangeValue(["1", "5"])).toEqual([1, 5]);
  });
});
