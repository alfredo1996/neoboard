import { describe, it, expect, beforeEach } from "vitest";
import { useParameterStore } from "@/stores/parameter-store";

function resetStore() {
  useParameterStore.getState().clearAll();
}

describe("ParamDateRelative — store interactions", () => {
  beforeEach(resetStore);

  it("stores only the preset key — _from/_to are resolved dynamically at query time", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter(
      "window",
      "last_7_days",
      "Parameter Selector",
      "window",
      "date-relative",
      "selector-widget",
    );

    const params = useParameterStore.getState().parameters;
    expect(params["window"].value).toBe("last_7_days");
    expect(params["window"].type).toBe("date-relative");
    expect(params["window_from"]).toBeUndefined();
    expect(params["window_to"]).toBeUndefined();
  });

  it("clears the preset key when empty preset is set", () => {
    const { setParameter, clearParameter } = useParameterStore.getState();
    setParameter(
      "window",
      "today",
      "Parameter Selector",
      "window",
      "date-relative",
      "selector-widget",
    );
    clearParameter("window");

    const params = useParameterStore.getState().parameters;
    expect(params["window"]).toBeUndefined();
    expect(params["window_from"]).toBeUndefined();
    expect(params["window_to"]).toBeUndefined();
  });
});

describe("ParamDateRelative — value coercion", () => {
  beforeEach(resetStore);

  it("reads preset key from store", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter(
      "window",
      "last_7_days",
      "Parameter Selector",
      "window",
      "date-relative",
      "selector-widget",
    );
    const currentEntry = useParameterStore.getState().parameters["window"];
    const relValue = currentEntry ? (currentEntry.value as string) : "";
    expect(relValue).toBe("last_7_days");
  });
});
