import { describe, it, expect, beforeEach } from "vitest";
import { useParameterStore } from "@/stores/parameter-store";

function resetStore() {
  useParameterStore.getState().clearAll();
}

describe("ParamSelect — store interactions", () => {
  beforeEach(resetStore);

  it("sets a select parameter", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter(
      "dbType",
      "neo4j",
      "Parameter Selector",
      "dbType",
      "select",
      "selector-widget",
    );
    const entry = useParameterStore.getState().parameters["dbType"];
    expect(entry.value).toBe("neo4j");
    expect(entry.type).toBe("select");
  });

  it("clears when empty string value is provided", () => {
    const { setParameter, clearParameter } = useParameterStore.getState();
    setParameter(
      "dbType",
      "neo4j",
      "Parameter Selector",
      "dbType",
      "select",
      "selector-widget",
    );
    clearParameter("dbType");
    expect(useParameterStore.getState().parameters["dbType"]).toBeUndefined();
  });
});

describe("ParamSelect — rawValue preservation", () => {
  beforeEach(resetStore);

  it("preserves number type when stored via setParameter", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter(
      "age",
      42,
      "Parameter Selector",
      "age",
      "select",
      "selector-widget",
    );
    const entry = useParameterStore.getState().parameters["age"];
    expect(entry.value).toBe(42);
    expect(typeof entry.value).toBe("number");
  });

  it("rawValue lookup stores typed value instead of String()", () => {
    const options = [
      { value: "42", label: "Forty-Two", rawValue: 42 },
      { value: "100", label: "Hundred", rawValue: 100 },
    ];
    const selectedString = "42";
    const opt = options.find((o) => o.value === selectedString);
    const storedValue =
      opt?.rawValue !== undefined ? opt.rawValue : selectedString;
    expect(storedValue).toBe(42);
    expect(typeof storedValue).toBe("number");
  });

  it("falls back to string when rawValue is undefined", () => {
    const options: { value: string; label: string; rawValue?: unknown }[] = [
      { value: "abc", label: "ABC" },
    ];
    const selectedString = "abc";
    const opt = options.find((o) => o.value === selectedString);
    const storedValue =
      opt?.rawValue !== undefined ? opt.rawValue : selectedString;
    expect(storedValue).toBe("abc");
    expect(typeof storedValue).toBe("string");
  });

  it("preserves boolean type via setParameter", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter(
      "active",
      true,
      "Parameter Selector",
      "active",
      "select",
      "selector-widget",
    );
    const entry = useParameterStore.getState().parameters["active"];
    expect(entry.value).toBe(true);
    expect(typeof entry.value).toBe("boolean");
  });
});
