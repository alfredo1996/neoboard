import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useParameterStore } from "@/stores/parameter-store";
import { useParamActions } from "../use-param-actions";

function resetStore() {
  useParameterStore.getState().clearAll();
}

describe("useParamActions", () => {
  beforeEach(resetStore);

  it("set() writes the value to the parameter store", () => {
    const { result } = renderHook(() =>
      useParamActions("city", "text", "widget-1"),
    );

    act(() => {
      result.current.set("Berlin");
    });

    const entry = useParameterStore.getState().parameters["city"];
    expect(entry).toBeDefined();
    expect(entry.value).toBe("Berlin");
    expect(entry.type).toBe("text");
    expect(entry.sourceType).toBe("selector-widget");
  });

  it("clear() removes the parameter from the store", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter(
      "city",
      "Berlin",
      "Parameter Selector",
      "city",
      "text",
      "selector-widget",
    );

    const { result } = renderHook(() => useParamActions("city", "text"));

    act(() => {
      result.current.clear();
    });

    expect(useParameterStore.getState().parameters["city"]).toBeUndefined();
  });

  it("setCompanion() writes a suffixed companion parameter", () => {
    const { result } = renderHook(() =>
      useParamActions("dateRange", "date-range", "widget-2"),
    );

    act(() => {
      result.current.setCompanion("from", "2026-01-01", "date");
    });

    const entry = useParameterStore.getState().parameters["dateRange_from"];
    expect(entry).toBeDefined();
    expect(entry.value).toBe("2026-01-01");
    expect(entry.type).toBe("date");
  });

  it("clearCompanion() removes the suffixed companion parameter", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter(
      "dateRange_from",
      "2026-01-01",
      "Parameter Selector",
      "dateRange_from",
      "date",
      "selector-widget",
    );

    const { result } = renderHook(() =>
      useParamActions("dateRange", "date-range"),
    );

    act(() => {
      result.current.clearCompanion("from");
    });

    expect(
      useParameterStore.getState().parameters["dateRange_from"],
    ).toBeUndefined();
  });

  it("currentEntry reflects the current store value", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter(
      "age",
      42,
      "Parameter Selector",
      "age",
      "select",
      "selector-widget",
    );

    const { result } = renderHook(() => useParamActions("age", "select"));
    expect(result.current.currentEntry).toBeDefined();
    expect(result.current.currentEntry?.value).toBe(42);
  });

  it("currentEntry is undefined when no value is set", () => {
    const { result } = renderHook(() => useParamActions("nonexistent", "text"));
    expect(result.current.currentEntry).toBeUndefined();
  });
});
