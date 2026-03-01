import { describe, it, expect } from "vitest";
import { resolveClickAction } from "../resolve-click-action";
import type { DashboardWidget } from "../db/schema";

function makeWidget(overrides: Partial<DashboardWidget> = {}): DashboardWidget {
  return {
    id: "w1",
    chartType: "bar",
    connectionId: "c1",
    query: "RETURN 1",
    settings: {},
    ...overrides,
  };
}

describe("resolveClickAction", () => {
  it("returns null when widget has no click action", () => {
    const result = resolveClickAction(makeWidget(), { name: "Alice" });
    expect(result).toBeNull();
  });

  it("returns setParameter for set-parameter action", () => {
    const widget = makeWidget({
      settings: {
        title: "Movies",
        clickAction: {
          type: "set-parameter",
          parameterMapping: { parameterName: "selectedMovie", sourceField: "name" },
        },
      },
    });
    const result = resolveClickAction(widget, { name: "The Matrix", value: 100 });
    expect(result).toEqual({
      setParameter: {
        parameterName: "selectedMovie",
        value: "The Matrix",
        label: "Movies",
        sourceField: "name",
      },
    });
  });

  it("returns navigateToPageId for navigate-to-page action", () => {
    const widget = makeWidget({
      settings: {
        clickAction: {
          type: "navigate-to-page",
          targetPageId: "page-2",
        },
      },
    });
    const result = resolveClickAction(widget, { name: "Alice" });
    expect(result).toEqual({
      navigateToPageId: "page-2",
    });
  });

  it("returns both for set-parameter-and-navigate action", () => {
    const widget = makeWidget({
      settings: {
        title: "Overview",
        clickAction: {
          type: "set-parameter-and-navigate",
          parameterMapping: { parameterName: "dept", sourceField: "department" },
          targetPageId: "page-details",
        },
      },
    });
    const result = resolveClickAction(widget, { department: "Engineering", count: 42 });
    expect(result).toEqual({
      setParameter: {
        parameterName: "dept",
        value: "Engineering",
        label: "Overview",
        sourceField: "department",
      },
      navigateToPageId: "page-details",
    });
  });

  it("returns null when sourceField value is missing from point", () => {
    const widget = makeWidget({
      settings: {
        clickAction: {
          type: "set-parameter",
          parameterMapping: { parameterName: "x", sourceField: "missing" },
        },
      },
    });
    const result = resolveClickAction(widget, { name: "Alice" });
    expect(result).toBeNull();
  });

  it("returns null when parameterMapping is missing for set-parameter", () => {
    const widget = makeWidget({
      settings: {
        clickAction: {
          type: "set-parameter",
          // no parameterMapping
        },
      },
    });
    const result = resolveClickAction(widget, { name: "Alice" });
    expect(result).toBeNull();
  });

  it("returns null when targetPageId is missing for navigate-to-page", () => {
    const widget = makeWidget({
      settings: {
        clickAction: {
          type: "navigate-to-page",
          // no targetPageId
        },
      },
    });
    const result = resolveClickAction(widget, { name: "Alice" });
    expect(result).toBeNull();
  });

  it("uses chartType as fallback label when title is not set", () => {
    const widget = makeWidget({
      settings: {
        clickAction: {
          type: "set-parameter",
          parameterMapping: { parameterName: "x", sourceField: "name" },
        },
      },
    });
    const result = resolveClickAction(widget, { name: "Bob" });
    expect(result?.setParameter?.label).toBe("bar");
  });

  it("uses _clickedValue directly for table cell-click points", () => {
    const widget = makeWidget({
      settings: {
        title: "Users Table",
        clickAction: {
          type: "set-parameter",
          parameterMapping: { parameterName: "selectedName", sourceField: "" },
        },
      },
    });
    const result = resolveClickAction(widget, { _clickedColumn: "name", _clickedValue: "Alice" });
    expect(result).toEqual({
      setParameter: {
        parameterName: "selectedName",
        value: "Alice",
        label: "Users Table",
        sourceField: "name",
      },
    });
  });

  it("uses _clickedValue when sourceField is empty string", () => {
    const widget = makeWidget({
      settings: {
        title: "Table",
        clickAction: {
          type: "set-parameter-and-navigate",
          parameterMapping: { parameterName: "dept", sourceField: "" },
          targetPageId: "page-2",
        },
      },
    });
    const result = resolveClickAction(widget, { _clickedColumn: "department", _clickedValue: "Engineering" });
    expect(result).toEqual({
      setParameter: {
        parameterName: "dept",
        value: "Engineering",
        label: "Table",
        sourceField: "department",
      },
      navigateToPageId: "page-2",
    });
  });

  it("returns null when cell-click value is undefined", () => {
    const widget = makeWidget({
      settings: {
        clickAction: {
          type: "set-parameter",
          parameterMapping: { parameterName: "x", sourceField: "" },
        },
      },
    });
    const result = resolveClickAction(widget, { _clickedColumn: "name" });
    expect(result).toBeNull();
  });

  it("allows value to be 0 (falsy but defined)", () => {
    const widget = makeWidget({
      settings: {
        clickAction: {
          type: "set-parameter",
          parameterMapping: { parameterName: "count", sourceField: "val" },
        },
      },
    });
    const result = resolveClickAction(widget, { val: 0 });
    expect(result?.setParameter?.value).toBe(0);
  });
});
