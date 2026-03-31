import { describe, it, expect, beforeEach } from "vitest";
import { useParameterStore } from "@/stores/parameter-store";

function resetStore() {
  useParameterStore.getState().clearAll();
}

describe("ParamDateRange — store interactions", () => {
  beforeEach(resetStore);

  it("sets compound _from/_to parameters alongside the range object", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter(
      "period",
      { from: "2024-01-01", to: "2024-01-31" },
      "Parameter Selector",
      "period",
      "date-range",
      "selector-widget",
    );
    setParameter(
      "period_from",
      "2024-01-01",
      "Parameter Selector",
      "period_from",
      "date",
      "selector-widget",
    );
    setParameter(
      "period_to",
      "2024-01-31",
      "Parameter Selector",
      "period_to",
      "date",
      "selector-widget",
    );

    const params = useParameterStore.getState().parameters;
    expect(params["period"].value).toEqual({
      from: "2024-01-01",
      to: "2024-01-31",
    });
    expect(params["period_from"].value).toBe("2024-01-01");
    expect(params["period_to"].value).toBe("2024-01-31");
  });

  it("clears _from when from is empty but keeps _to when to is set (partial clear)", () => {
    const { setParameter, clearParameter } = useParameterStore.getState();
    setParameter(
      "period",
      { from: "", to: "2024-06-30" },
      "Parameter Selector",
      "period",
      "date-range",
      "selector-widget",
    );
    clearParameter("period_from");
    setParameter(
      "period_to",
      "2024-06-30",
      "Parameter Selector",
      "period_to",
      "date",
      "selector-widget",
    );

    const params = useParameterStore.getState().parameters;
    expect(params["period_from"]).toBeUndefined();
    expect(params["period_to"].value).toBe("2024-06-30");
  });

  it("clears _to when to is empty but keeps _from when from is set", () => {
    const { setParameter, clearParameter } = useParameterStore.getState();
    setParameter(
      "period",
      { from: "2024-06-01", to: "" },
      "Parameter Selector",
      "period",
      "date-range",
      "selector-widget",
    );
    setParameter(
      "period_from",
      "2024-06-01",
      "Parameter Selector",
      "period_from",
      "date",
      "selector-widget",
    );
    clearParameter("period_to");

    const params = useParameterStore.getState().parameters;
    expect(params["period_from"].value).toBe("2024-06-01");
    expect(params["period_to"]).toBeUndefined();
  });

  it("clears all three params when both from and to are empty", () => {
    const { setParameter, clearParameter } = useParameterStore.getState();
    setParameter(
      "period",
      { from: "2024-01-01", to: "2024-01-31" },
      "Parameter Selector",
      "period",
      "date-range",
      "selector-widget",
    );
    setParameter(
      "period_from",
      "2024-01-01",
      "Parameter Selector",
      "period_from",
      "date",
      "selector-widget",
    );
    setParameter(
      "period_to",
      "2024-01-31",
      "Parameter Selector",
      "period_to",
      "date",
      "selector-widget",
    );

    clearParameter("period");
    clearParameter("period_from");
    clearParameter("period_to");

    const params = useParameterStore.getState().parameters;
    expect(params["period"]).toBeUndefined();
    expect(params["period_from"]).toBeUndefined();
    expect(params["period_to"]).toBeUndefined();
  });
});

describe("ParamDateRange — value coercion", () => {
  beforeEach(resetStore);

  it("extracts from/to from object value", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter(
      "period",
      { from: "2024-01-01", to: "2024-01-31" },
      "Parameter Selector",
      "period",
      "date-range",
      "selector-widget",
    );
    const currentEntry = useParameterStore.getState().parameters["period"];
    const rangeEntry = currentEntry?.value as
      | { from?: string; to?: string }
      | undefined;
    expect(rangeEntry?.from ?? "").toBe("2024-01-01");
    expect(rangeEntry?.to ?? "").toBe("2024-01-31");
  });

  it("returns empty strings when no entry", () => {
    const currentEntry = useParameterStore.getState().parameters["period"];
    const rangeEntry = currentEntry?.value as
      | { from?: string; to?: string }
      | undefined;
    expect(rangeEntry?.from ?? "").toBe("");
    expect(rangeEntry?.to ?? "").toBe("");
  });
});
