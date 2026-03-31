// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useParameterStore } from "@/stores/parameter-store";
import { useCascadingClear } from "../use-cascading-clear";

function resetStore() {
  useParameterStore.getState().clearAll();
}

describe("useCascadingClear", () => {
  beforeEach(resetStore);

  it("clears the child parameter when the parent value changes", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter(
      "city",
      "Berlin",
      "Parameter Selector",
      "city",
      "cascading-select",
      "selector-widget",
    );

    const { rerender } = renderHook(
      ({ parentValue }) =>
        useCascadingClear("city", "cascading-select", "country", parentValue),
      { initialProps: { parentValue: "DE" } },
    );

    // Child should still exist after initial render (no previous value to compare)
    expect(useParameterStore.getState().parameters["city"]).toBeDefined();

    // Re-set the child (simulating user selecting a value)
    setParameter(
      "city",
      "Berlin",
      "Parameter Selector",
      "city",
      "cascading-select",
      "selector-widget",
    );

    // Change parent value -- should clear the child
    rerender({ parentValue: "US" });
    expect(useParameterStore.getState().parameters["city"]).toBeUndefined();
  });

  it("does not clear for non-cascading-select types", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter(
      "name",
      "Alice",
      "Parameter Selector",
      "name",
      "text",
      "selector-widget",
    );

    const { rerender } = renderHook(
      ({ parentValue }) =>
        useCascadingClear("name", "text", "parent", parentValue),
      { initialProps: { parentValue: "A" } },
    );

    rerender({ parentValue: "B" });
    // Should NOT be cleared because type is "text", not "cascading-select"
    expect(useParameterStore.getState().parameters["name"]).toBeDefined();
    expect(useParameterStore.getState().parameters["name"].value).toBe("Alice");
  });

  it("does not clear when parentParameterName is undefined", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter(
      "item",
      "X",
      "Parameter Selector",
      "item",
      "cascading-select",
      "selector-widget",
    );

    const { rerender } = renderHook(
      ({ parentValue }) =>
        useCascadingClear("item", "cascading-select", undefined, parentValue),
      { initialProps: { parentValue: "A" } },
    );

    rerender({ parentValue: "B" });
    expect(useParameterStore.getState().parameters["item"]).toBeDefined();
  });

  it("does not clear when parent value stays the same", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter(
      "city",
      "Berlin",
      "Parameter Selector",
      "city",
      "cascading-select",
      "selector-widget",
    );

    const { rerender } = renderHook(
      ({ parentValue }) =>
        useCascadingClear("city", "cascading-select", "country", parentValue),
      { initialProps: { parentValue: "DE" } },
    );

    rerender({ parentValue: "DE" });
    expect(useParameterStore.getState().parameters["city"]).toBeDefined();
  });
});
