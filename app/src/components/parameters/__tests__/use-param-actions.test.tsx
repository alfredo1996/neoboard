import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useParameterStore } from "@/stores/parameter-store";
import { useParamActions, useTypedSelection } from "../use-param-actions";

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

  // A link restores "1999"; typing it as 1999 must not relabel it as picked (#2114).
  it("retype() changes only the value; the entry keeps who set it", () => {
    useParameterStore
      .getState()
      .setParameter("year", "1999", "URL", "year", "select", "url", "w-url");

    const { result } = renderHook(() =>
      useParamActions("year", "select", "w-selector"),
    );
    act(() => {
      result.current.retype(1999);
    });

    expect(useParameterStore.getState().parameters["year"]).toEqual({
      value: 1999,
      source: "URL",
      field: "year",
      type: "select",
      sourceType: "url",
      sourceWidgetId: "w-url",
    });
  });

  it("retype() does nothing when the parameter is not set", () => {
    const { result } = renderHook(() => useParamActions("year", "select"));
    act(() => {
      result.current.retype(1999);
    });
    expect(useParameterStore.getState().parameters["year"]).toBeUndefined();
  });

  // A default, a link or a click action never fires the selector's onChange (#2334).
  describe("useTypedSelection — fills in the label of a value nobody picked", () => {
    const OPTIONS = [
      { value: "%", label: "All continents" },
      { value: "EU", label: "Europe" },
      { value: "1999", label: "Year 1999", rawValue: 1999 },
    ];
    const run = () =>
      renderHook(
        ({ options }) => {
          const actions = useParamActions("geo", "select", "w");
          useTypedSelection(actions, options);
          return actions;
        },
        { initialProps: { options: OPTIONS } },
      );
    const entry = () => useParameterStore.getState().parameters["geo"];

    it.each([
      ["a default", "%", "All continents"],
      ["several values", ["%", "EU"], "All continents, Europe"],
      ["a typed value", 1999, "Year 1999"],
    ])("labels %s from the options, keeping who set it", (_l, value, label) => {
      useParameterStore
        .getState()
        .setParameter("geo", value, "URL", "geo", "select", "url", "w-url");
      run();
      expect(entry().label).toBe(label);
      expect(entry().sourceType).toBe("url");
      expect(entry().sourceWidgetId).toBe("w-url");
    });

    it("keeps a label already there and leaves a value no option names unlabelled", () => {
      const store = useParameterStore.getState();
      store.setParameter("geo", "EU", "S", "geo", "select", "selector-widget");
      store.setParameterLabel("geo", "Picked name");
      run();
      expect(entry().label).toBe("Picked name");

      store.setParameter("geo", "XX", "S", "geo", "select", "selector-widget");
      run();
      expect(entry().label).toBeUndefined();
    });

    // Two selectors on one parameter (e.g. on different pages, all mounted) whose seeds
    // label the value differently must not overwrite each other forever.
    it("two selectors with conflicting labels settle instead of looping", () => {
      useParameterStore
        .getState()
        .setParameter("geo", "EU", "URL", "geo", "select", "url", "w-url");
      let writes = 0;
      const real = useParameterStore.getState().setParameterLabel;
      useParameterStore.setState({
        setParameterLabel: (name, label) => {
          if (++writes > 20) throw new Error("label update loop");
          real(name, label);
        },
      });
      const seeded = (label: string) => () => {
        const actions = useParamActions("geo", "select", "w");
        useTypedSelection(actions, [{ value: "EU", label }]);
      };
      try {
        renderHook(seeded("First"));
        renderHook(seeded("Second"));
        expect(writes).toBeLessThanOrEqual(1);
        expect(entry().label).toBe("First");
      } finally {
        useParameterStore.setState({ setParameterLabel: real });
      }
    });
  });
});
