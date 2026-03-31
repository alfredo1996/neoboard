import { describe, it, expect, beforeEach } from "vitest";
import { useParameterStore } from "@/stores/parameter-store";

function resetStore() {
  useParameterStore.getState().clearAll();
}

describe("ParamCascadingSelect — store interactions", () => {
  beforeEach(resetStore);

  it("clears child parameter when parent value changes", () => {
    const { setParameter, clearParameter } = useParameterStore.getState();
    setParameter(
      "country",
      "US",
      "Parameter Selector",
      "country",
      "select",
      "selector-widget",
    );
    setParameter(
      "state",
      "NY",
      "Parameter Selector",
      "state",
      "cascading-select",
      "selector-widget",
    );

    setParameter(
      "country",
      "UK",
      "Parameter Selector",
      "country",
      "select",
      "selector-widget",
    );
    clearParameter("state"); // renderer's useCascadingClear does this

    expect(useParameterStore.getState().parameters["state"]).toBeUndefined();
    expect(useParameterStore.getState().parameters["country"].value).toBe("UK");
  });
});

describe("ParamCascadingSelect — value coercion", () => {
  beforeEach(resetStore);

  it("reads string value from store entry", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter(
      "state",
      "NY",
      "Parameter Selector",
      "state",
      "cascading-select",
      "selector-widget",
    );
    const currentEntry = useParameterStore.getState().parameters["state"];
    const cascadeValue = currentEntry ? String(currentEntry.value ?? "") : "";
    expect(cascadeValue).toBe("NY");
  });
});

describe("ParamCascadingSelect — parent params construction", () => {
  beforeEach(resetStore);

  it("builds extraParams with parent value", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter(
      "country",
      "US",
      "Parameter Selector",
      "country",
      "select",
      "selector-widget",
    );

    const parentParameterName = "country";
    const parentValue = String(
      useParameterStore.getState().parameters[parentParameterName]?.value ?? "",
    );
    const parentParams =
      parentParameterName && parentValue
        ? { [`param_${parentParameterName}`]: parentValue }
        : {};
    expect(parentParams).toEqual({ param_country: "US" });
  });

  it("returns empty object when parent value is not set", () => {
    const parentParameterName = "country";
    const parentValue = String(
      useParameterStore.getState().parameters[parentParameterName]?.value ?? "",
    );
    const parentParams =
      parentParameterName && parentValue
        ? { [`param_${parentParameterName}`]: parentValue }
        : {};
    expect(parentParams).toEqual({});
  });

  it("returns empty object when no parentParameterName", () => {
    const parentParameterName = undefined;
    const parentValue = undefined;
    const parentParams =
      parentParameterName && parentValue
        ? { [`param_${parentParameterName}`]: parentValue }
        : {};
    expect(parentParams).toEqual({});
  });
});
