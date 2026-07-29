// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useParameterStore } from "@/stores/parameter-store";
import { useCascadingClear } from "../use-cascading-clear";

function resetStore() {
  useParameterStore.getState().clearAll();
}

function seedChild(name: string, value: string) {
  useParameterStore
    .getState()
    .setParameter(
      name,
      value,
      "Parameter Selector",
      name,
      "select",
      "selector-widget",
    );
}

describe("useCascadingClear", () => {
  beforeEach(resetStore);

  it("clears the child parameter when the parent value changes", () => {
    seedChild("city", "Berlin");

    const { rerender } = renderHook(
      ({ parentValue }) => useCascadingClear("city", "country", parentValue),
      { initialProps: { parentValue: "DE" } },
    );

    // Child should still exist after initial render (no previous value to compare)
    expect(useParameterStore.getState().parameters["city"]).toBeDefined();

    // Re-set the child (simulating user selecting a value)
    seedChild("city", "Berlin");

    // Change parent value -- should clear the child
    rerender({ parentValue: "US" });
    expect(useParameterStore.getState().parameters["city"]).toBeUndefined();
  });

  it("clears the child when the parent is cleared entirely", () => {
    seedChild("city", "Berlin");

    const { rerender } = renderHook(
      ({ parentValue }: { parentValue: string | undefined }) =>
        useCascadingClear("city", "country", parentValue),
      { initialProps: { parentValue: "DE" as string | undefined } },
    );

    seedChild("city", "Berlin");
    rerender({ parentValue: undefined });
    expect(useParameterStore.getState().parameters["city"]).toBeUndefined();
  });

  it("does not clear when parentParameterName is undefined", () => {
    seedChild("item", "X");

    const { rerender } = renderHook(
      ({ parentValue }) => useCascadingClear("item", undefined, parentValue),
      { initialProps: { parentValue: "A" } },
    );

    rerender({ parentValue: "B" });
    expect(useParameterStore.getState().parameters["item"]).toBeDefined();
    expect(useParameterStore.getState().parameters["item"].value).toBe("X");
  });

  it("does not clear when parentParameterName is an empty string", () => {
    seedChild("item", "X");

    const { rerender } = renderHook(
      ({ parentValue }) => useCascadingClear("item", "", parentValue),
      { initialProps: { parentValue: "A" } },
    );

    rerender({ parentValue: "B" });
    expect(useParameterStore.getState().parameters["item"]).toBeDefined();
  });

  it("does not clear when parent value stays the same", () => {
    seedChild("city", "Berlin");

    const { rerender } = renderHook(
      ({ parentValue }) => useCascadingClear("city", "country", parentValue),
      { initialProps: { parentValue: "DE" } },
    );

    rerender({ parentValue: "DE" });
    expect(useParameterStore.getState().parameters["city"]).toBeDefined();
    expect(useParameterStore.getState().parameters["city"].value).toBe(
      "Berlin",
    );
  });
});
