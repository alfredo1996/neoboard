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
});
