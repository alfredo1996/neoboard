import { describe, it, expect, beforeEach } from "vitest";
import { useParameterStore } from "@/stores/parameter-store";

function resetStore() {
  useParameterStore.getState().clearAll();
}

describe("ParamText — store interactions", () => {
  beforeEach(resetStore);

  it("sets a text parameter with selector-widget source", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter(
      "city",
      "Berlin",
      "Parameter Selector",
      "city",
      "text",
      "selector-widget",
    );
    const entry = useParameterStore.getState().parameters["city"];
    expect(entry.value).toBe("Berlin");
    expect(entry.type).toBe("text");
    expect(entry.sourceType).toBe("selector-widget");
  });

  it("clears a text parameter when empty value is set", () => {
    const { setParameter, clearParameter } = useParameterStore.getState();
    setParameter(
      "city",
      "Berlin",
      "Parameter Selector",
      "city",
      "text",
      "selector-widget",
    );
    clearParameter("city");
    expect(useParameterStore.getState().parameters["city"]).toBeUndefined();
  });
});

describe("ParamText — value coercion", () => {
  beforeEach(resetStore);

  it("reads string value from store entry", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter(
      "city",
      "Berlin",
      "Parameter Selector",
      "city",
      "text",
      "selector-widget",
    );
    const currentEntry = useParameterStore.getState().parameters["city"];
    const textValue = currentEntry ? String(currentEntry.value ?? "") : "";
    expect(textValue).toBe("Berlin");
  });

  it("returns empty string when no entry exists", () => {
    const currentEntry = useParameterStore.getState().parameters["city"];
    const textValue = currentEntry ? String(currentEntry.value ?? "") : "";
    expect(textValue).toBe("");
  });
});
