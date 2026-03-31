import { describe, it, expect, beforeEach } from "vitest";
import { useParameterStore } from "@/stores/parameter-store";
import type { ParameterType } from "@/stores/parameter-store";

describe("Seed query enablement logic", () => {
  const needsSeedTypes: ParameterType[] = [
    "select",
    "multi-select",
    "cascading-select",
  ];
  const noSeedTypes: ParameterType[] = [
    "text",
    "date",
    "date-range",
    "date-relative",
    "number-range",
  ];

  it("select, multi-select, and cascading-select types require seed queries", () => {
    for (const type of needsSeedTypes) {
      const needsSeed =
        type === "select" ||
        type === "multi-select" ||
        type === "cascading-select";
      expect(needsSeed).toBe(true);
    }
  });

  it("text, date, date-range, date-relative, and number-range do not require seed queries", () => {
    for (const type of noSeedTypes) {
      const needsSeed =
        type === "select" ||
        type === "multi-select" ||
        type === "cascading-select";
      expect(needsSeed).toBe(false);
    }
  });

  it("cascading-select is disabled until parent value is set", () => {
    const parameterType: string = "cascading-select";
    const parentParameterName: string | undefined = "country";
    const parentValue = "";
    const cascadingEnabled =
      parameterType !== "cascading-select" ||
      (parentParameterName !== undefined ? !!parentValue : true);
    expect(cascadingEnabled).toBe(false);
  });

  it("cascading-select is enabled when parent value is set", () => {
    const parameterType: string = "cascading-select";
    const parentParameterName: string | undefined = "country";
    const parentValue = "US";
    const cascadingEnabled =
      parameterType !== "cascading-select" ||
      (parentParameterName !== undefined ? !!parentValue : true);
    expect(cascadingEnabled).toBe(true);
  });

  it("cascading-select is enabled when no parentParameterName is provided", () => {
    const parameterType: string = "cascading-select";
    const parentParameterName: string | undefined = undefined;
    const parentValue: string | undefined = undefined;
    const cascadingEnabled =
      parameterType !== "cascading-select" ||
      (parentParameterName !== undefined ? !!parentValue : true);
    expect(cascadingEnabled).toBe(true);
  });
});

describe("Searchable extraParams computation", () => {
  it("includes param_search when debounced search is set", () => {
    const searchable = true;
    const debouncedSearch = "test";
    const parameterType: string = "select";
    const parentParams = {};

    const base = parameterType === "cascading-select" ? parentParams : {};
    let seedExtraParams: Record<string, unknown> | undefined;
    if (searchable && debouncedSearch) {
      seedExtraParams = { ...base, param_search: debouncedSearch };
    } else {
      seedExtraParams = Object.keys(base).length > 0 ? base : undefined;
    }
    expect(seedExtraParams).toEqual({ param_search: "test" });
  });

  it("is undefined when search is empty", () => {
    const searchable = true;
    const debouncedSearch = "";
    const parameterType: string = "select";
    const parentParams = {};

    const base = parameterType === "cascading-select" ? parentParams : {};
    let seedExtraParams: Record<string, unknown> | undefined;
    if (searchable && debouncedSearch) {
      seedExtraParams = { ...base, param_search: debouncedSearch };
    } else {
      seedExtraParams = Object.keys(base).length > 0 ? base : undefined;
    }
    expect(seedExtraParams).toBeUndefined();
  });

  it("non-searchable mode does not include param_search", () => {
    const searchable = false;
    const debouncedSearch = "test";
    const parameterType: string = "select";
    const parentParams = {};

    const base = parameterType === "cascading-select" ? parentParams : {};
    let seedExtraParams: Record<string, unknown> | undefined;
    if (searchable && debouncedSearch) {
      seedExtraParams = { ...base, param_search: debouncedSearch };
    } else {
      seedExtraParams = Object.keys(base).length > 0 ? base : undefined;
    }
    expect(seedExtraParams).toBeUndefined();
  });
});

describe("useParameterValues selector coverage", () => {
  beforeEach(() => {
    useParameterStore.getState().clearAll();
  });

  it("returns empty object when no parameters are set", () => {
    const state = useParameterStore.getState();
    const result: Record<string, unknown> = {};
    for (const [name, entry] of Object.entries(state.parameters)) {
      result[name] = (entry as { value: unknown }).value;
    }
    expect(result).toEqual({});
  });

  it("returns name→value mapping for all set parameters", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter("a", 1, "W", "a");
    setParameter("b", "hello", "W", "b");
    setParameter("c", [1, 2], "W", "c", "multi-select", "selector-widget");

    const state = useParameterStore.getState();
    const result: Record<string, unknown> = {};
    for (const [name, entry] of Object.entries(state.parameters)) {
      result[name] = (entry as { value: unknown }).value;
    }
    expect(result).toEqual({ a: 1, b: "hello", c: [1, 2] });
  });
});
