import { describe, it, expect, beforeEach } from "vitest";
import { useParameterStore } from "@/stores/parameter-store";

function resetStore() {
  useParameterStore.getState().clearAll();
}

describe("ParamMultiSelect — store interactions", () => {
  beforeEach(resetStore);

  it("stores an array value", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter(
      "tags",
      ["a", "b"],
      "Parameter Selector",
      "tags",
      "multi-select",
      "selector-widget",
    );
    const entry = useParameterStore.getState().parameters["tags"];
    expect(entry.value).toEqual(["a", "b"]);
    expect(entry.type).toBe("multi-select");
  });

  it("clears when empty array means clear", () => {
    const { setParameter, clearParameter } = useParameterStore.getState();
    setParameter(
      "tags",
      ["a"],
      "Parameter Selector",
      "tags",
      "multi-select",
      "selector-widget",
    );
    clearParameter("tags");
    expect(useParameterStore.getState().parameters["tags"]).toBeUndefined();
  });
});

describe("ParamMultiSelect — value coercion", () => {
  beforeEach(resetStore);

  it("converts array value to string[]", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter(
      "tags",
      ["a", "b", "c"],
      "Parameter Selector",
      "tags",
      "multi-select",
      "selector-widget",
    );
    const currentEntry = useParameterStore.getState().parameters["tags"];
    const rawValues = currentEntry?.value;
    const multiValues: string[] = Array.isArray(rawValues)
      ? (rawValues as unknown[]).map(String)
      : rawValues
        ? [String(rawValues)]
        : [];
    expect(multiValues).toEqual(["a", "b", "c"]);
  });

  it("wraps single value in array", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter(
      "tags",
      "solo",
      "Parameter Selector",
      "tags",
      "multi-select",
      "selector-widget",
    );
    const currentEntry = useParameterStore.getState().parameters["tags"];
    const rawValues = currentEntry?.value;
    const multiValues: string[] = Array.isArray(rawValues)
      ? (rawValues as unknown[]).map(String)
      : rawValues
        ? [String(rawValues)]
        : [];
    expect(multiValues).toEqual(["solo"]);
  });

  it("returns empty array when no entry", () => {
    const currentEntry = useParameterStore.getState().parameters["tags"];
    const rawValues = currentEntry?.value;
    const multiValues: string[] = Array.isArray(rawValues)
      ? (rawValues as unknown[]).map(String)
      : rawValues
        ? [String(rawValues)]
        : [];
    expect(multiValues).toEqual([]);
  });

  it("preserves array of numbers from rawValue", () => {
    const { setParameter } = useParameterStore.getState();
    const rawVals = [1, 2, 3];
    setParameter(
      "ids",
      rawVals,
      "Parameter Selector",
      "ids",
      "multi-select",
      "selector-widget",
    );
    const entry = useParameterStore.getState().parameters["ids"];
    expect(entry.value).toEqual([1, 2, 3]);
    expect(typeof (entry.value as number[])[0]).toBe("number");
  });
});
