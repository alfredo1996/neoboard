import { describe, it, expect } from "vitest";
import { resolveClickAction, resolveClickActions, deriveClickableColumns } from "../resolve-click-action";
import type { DashboardWidget, ClickAction } from "../db/schema";

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

  it("returns null when value is an object (non-scalar)", () => {
    const widget = makeWidget({
      settings: {
        clickAction: {
          type: "set-parameter",
          parameterMapping: { parameterName: "x", sourceField: "data" },
        },
      },
    });
    const result = resolveClickAction(widget, { data: { nested: true } });
    expect(result).toBeNull();
  });

  it("returns null when value is an array (non-scalar)", () => {
    const widget = makeWidget({
      settings: {
        clickAction: {
          type: "set-parameter",
          parameterMapping: { parameterName: "x", sourceField: "items" },
        },
      },
    });
    const result = resolveClickAction(widget, { items: [1, 2, 3] });
    expect(result).toBeNull();
  });

  it("allows null as a valid scalar value", () => {
    const widget = makeWidget({
      settings: {
        clickAction: {
          type: "set-parameter",
          parameterMapping: { parameterName: "x", sourceField: "val" },
        },
      },
    });
    const result = resolveClickAction(widget, { val: null });
    expect(result?.setParameter?.value).toBeNull();
  });

  it("allows boolean as a valid scalar value", () => {
    const widget = makeWidget({
      settings: {
        clickAction: {
          type: "set-parameter",
          parameterMapping: { parameterName: "flag", sourceField: "active" },
        },
      },
    });
    const result = resolveClickAction(widget, { active: true });
    expect(result?.setParameter?.value).toBe(true);
  });

  it("returns null when cell-click _clickedColumn is missing", () => {
    const widget = makeWidget({
      settings: {
        clickAction: {
          type: "set-parameter",
          parameterMapping: { parameterName: "x", sourceField: "" },
        },
      },
    });
    const result = resolveClickAction(widget, { _clickedValue: "Alice" });
    expect(result).toBeNull();
  });

  it("returns null when cell-click _clickedColumn is empty string", () => {
    const widget = makeWidget({
      settings: {
        clickAction: {
          type: "set-parameter",
          parameterMapping: { parameterName: "x", sourceField: "" },
        },
      },
    });
    const result = resolveClickAction(widget, { _clickedColumn: "", _clickedValue: "Alice" });
    expect(result).toBeNull();
  });

  it("returns null when cell-click _clickedColumn is whitespace only", () => {
    const widget = makeWidget({
      settings: {
        clickAction: {
          type: "set-parameter",
          parameterMapping: { parameterName: "x", sourceField: "" },
        },
      },
    });
    const result = resolveClickAction(widget, { _clickedColumn: "   ", _clickedValue: "Alice" });
    expect(result).toBeNull();
  });

  it("returns null when cell-click _clickedColumn is a number (non-string)", () => {
    const widget = makeWidget({
      settings: {
        clickAction: {
          type: "set-parameter",
          parameterMapping: { parameterName: "x", sourceField: "" },
        },
      },
    });
    const result = resolveClickAction(widget, { _clickedColumn: 42, _clickedValue: "Alice" });
    expect(result).toBeNull();
  });

  // ─── clickableColumns validation ──────────────────────────────────────

  it("returns null when clicked column is not in clickableColumns", () => {
    const widget = makeWidget({
      settings: {
        clickAction: {
          type: "set-parameter",
          parameterMapping: { parameterName: "x", sourceField: "" },
          clickableColumns: ["name", "email"],
        },
      },
    });
    const result = resolveClickAction(widget, { _clickedColumn: "status", _clickedValue: "Active" });
    expect(result).toBeNull();
  });

  it("allows click when column is in clickableColumns", () => {
    const widget = makeWidget({
      settings: {
        title: "Users",
        clickAction: {
          type: "set-parameter",
          parameterMapping: { parameterName: "x", sourceField: "" },
          clickableColumns: ["name", "email"],
        },
      },
    });
    const result = resolveClickAction(widget, { _clickedColumn: "name", _clickedValue: "Alice" });
    expect(result).not.toBeNull();
    expect(result?.setParameter?.value).toBe("Alice");
  });

  it("allows click when clickableColumns is empty (all columns)", () => {
    const widget = makeWidget({
      settings: {
        title: "Users",
        clickAction: {
          type: "set-parameter",
          parameterMapping: { parameterName: "x", sourceField: "" },
          clickableColumns: [],
        },
      },
    });
    const result = resolveClickAction(widget, { _clickedColumn: "status", _clickedValue: "Active" });
    expect(result).not.toBeNull();
    expect(result?.setParameter?.value).toBe("Active");
  });

  it("allows click when clickableColumns is undefined (all columns)", () => {
    const widget = makeWidget({
      settings: {
        title: "Users",
        clickAction: {
          type: "set-parameter",
          parameterMapping: { parameterName: "x", sourceField: "" },
          // no clickableColumns
        },
      },
    });
    const result = resolveClickAction(widget, { _clickedColumn: "status", _clickedValue: "Active" });
    expect(result).not.toBeNull();
    expect(result?.setParameter?.value).toBe("Active");
  });
});

// ─── resolveClickActions (multi-rule) ─────────────────────────────────

describe("resolveClickActions", () => {
  it("returns null when widget has no click action", () => {
    const result = resolveClickActions(makeWidget(), { name: "Alice" });
    expect(result).toBeNull();
  });

  it("falls back to legacy single-rule when rules is undefined", () => {
    const widget = makeWidget({
      settings: {
        title: "Movies",
        clickAction: {
          type: "set-parameter",
          parameterMapping: { parameterName: "movie", sourceField: "name" },
        },
      },
    });
    const result = resolveClickActions(widget, { name: "The Matrix" });
    expect(result).toEqual({
      setParameter: {
        parameterName: "movie",
        value: "The Matrix",
        label: "Movies",
        sourceField: "name",
      },
    });
  });

  it("falls back to legacy single-rule when rules is empty array", () => {
    const widget = makeWidget({
      settings: {
        title: "Movies",
        clickAction: {
          type: "set-parameter",
          parameterMapping: { parameterName: "movie", sourceField: "name" },
          rules: [],
        },
      },
    });
    const result = resolveClickActions(widget, { name: "The Matrix" });
    expect(result).toEqual({
      setParameter: {
        parameterName: "movie",
        value: "The Matrix",
        label: "Movies",
        sourceField: "name",
      },
    });
  });

  it("matches table cell click to correct rule by triggerColumn", () => {
    const widget = makeWidget({
      settings: {
        title: "Users",
        clickAction: {
          type: "set-parameter",
          rules: [
            { id: "r1", triggerColumn: "name", type: "set-parameter", parameterMapping: { parameterName: "selectedName", sourceField: "name" } },
            { id: "r2", triggerColumn: "email", type: "set-parameter", parameterMapping: { parameterName: "selectedEmail", sourceField: "email" } },
          ],
        },
      },
    });
    const result = resolveClickActions(widget, { _clickedColumn: "name", _clickedValue: "Alice" });
    expect(result).toEqual({
      setParameter: {
        parameterName: "selectedName",
        value: "Alice",
        label: "Users",
        sourceField: "name",
      },
    });
  });

  it("matches second rule when clicking corresponding column", () => {
    const widget = makeWidget({
      settings: {
        title: "Users",
        clickAction: {
          type: "set-parameter",
          rules: [
            { id: "r1", triggerColumn: "name", type: "set-parameter", parameterMapping: { parameterName: "selectedName", sourceField: "name" } },
            { id: "r2", triggerColumn: "email", type: "set-parameter", parameterMapping: { parameterName: "selectedEmail", sourceField: "email" } },
          ],
        },
      },
    });
    const result = resolveClickActions(widget, { _clickedColumn: "email", _clickedValue: "alice@example.com" });
    expect(result).toEqual({
      setParameter: {
        parameterName: "selectedEmail",
        value: "alice@example.com",
        label: "Users",
        sourceField: "email",
      },
    });
  });

  it("returns null when table cell click matches no rule", () => {
    const widget = makeWidget({
      settings: {
        clickAction: {
          type: "set-parameter",
          rules: [
            { id: "r1", triggerColumn: "name", type: "set-parameter", parameterMapping: { parameterName: "x", sourceField: "name" } },
          ],
        },
      },
    });
    const result = resolveClickActions(widget, { _clickedColumn: "status", _clickedValue: "Active" });
    expect(result).toBeNull();
  });

  it("uses first rule for chart clicks (non-table)", () => {
    const widget = makeWidget({
      settings: {
        title: "Sales",
        clickAction: {
          type: "set-parameter",
          rules: [
            { id: "r1", type: "set-parameter", parameterMapping: { parameterName: "category", sourceField: "name" } },
            { id: "r2", type: "set-parameter", parameterMapping: { parameterName: "other", sourceField: "value" } },
          ],
        },
      },
    });
    const result = resolveClickActions(widget, { name: "Electronics", value: 100 });
    expect(result).toEqual({
      setParameter: {
        parameterName: "category",
        value: "Electronics",
        label: "Sales",
        sourceField: "name",
      },
    });
  });

  it("resolves navigate-to-page rule", () => {
    const widget = makeWidget({
      settings: {
        clickAction: {
          type: "navigate-to-page",
          rules: [
            { id: "r1", triggerColumn: "name", type: "navigate-to-page", targetPageId: "page-details" },
          ],
        },
      },
    });
    const result = resolveClickActions(widget, { _clickedColumn: "name", _clickedValue: "Alice" });
    expect(result).toEqual({
      navigateToPageId: "page-details",
    });
  });

  it("resolves set-parameter-and-navigate rule", () => {
    const widget = makeWidget({
      settings: {
        title: "Table",
        clickAction: {
          type: "set-parameter-and-navigate",
          rules: [
            {
              id: "r1",
              triggerColumn: "dept",
              type: "set-parameter-and-navigate",
              parameterMapping: { parameterName: "department", sourceField: "dept" },
              targetPageId: "page-dept",
            },
          ],
        },
      },
    });
    const result = resolveClickActions(widget, { _clickedColumn: "dept", _clickedValue: "Engineering" });
    expect(result).toEqual({
      setParameter: {
        parameterName: "department",
        value: "Engineering",
        label: "Table",
        sourceField: "dept",
      },
      navigateToPageId: "page-dept",
    });
  });

  it("returns null when rule has no parameterMapping for set-parameter type", () => {
    const widget = makeWidget({
      settings: {
        clickAction: {
          type: "set-parameter",
          rules: [
            { id: "r1", triggerColumn: "name", type: "set-parameter" },
          ],
        },
      },
    });
    const result = resolveClickActions(widget, { _clickedColumn: "name", _clickedValue: "Alice" });
    expect(result).toBeNull();
  });

  it("returns null when rule has no targetPageId for navigate-to-page type", () => {
    const widget = makeWidget({
      settings: {
        clickAction: {
          type: "navigate-to-page",
          rules: [
            { id: "r1", triggerColumn: "name", type: "navigate-to-page" },
          ],
        },
      },
    });
    const result = resolveClickActions(widget, { _clickedColumn: "name", _clickedValue: "Alice" });
    expect(result).toBeNull();
  });
});

// ─── deriveClickableColumns ───────────────────────────────────────────

describe("deriveClickableColumns", () => {
  it("returns undefined when clickAction is undefined", () => {
    expect(deriveClickableColumns(undefined)).toBeUndefined();
  });

  it("returns clickableColumns when no rules exist", () => {
    const action: ClickAction = {
      type: "set-parameter",
      clickableColumns: ["name", "email"],
    };
    expect(deriveClickableColumns(action)).toEqual(["name", "email"]);
  });

  it("returns undefined when no rules and no clickableColumns", () => {
    const action: ClickAction = { type: "set-parameter" };
    expect(deriveClickableColumns(action)).toBeUndefined();
  });

  it("returns clickableColumns when rules is empty array", () => {
    const action: ClickAction = {
      type: "set-parameter",
      clickableColumns: ["name"],
      rules: [],
    };
    expect(deriveClickableColumns(action)).toEqual(["name"]);
  });

  it("extracts triggerColumn values from rules", () => {
    const action: ClickAction = {
      type: "set-parameter",
      rules: [
        { id: "r1", triggerColumn: "name", type: "set-parameter", parameterMapping: { parameterName: "x", sourceField: "name" } },
        { id: "r2", triggerColumn: "email", type: "set-parameter", parameterMapping: { parameterName: "y", sourceField: "email" } },
      ],
    };
    expect(deriveClickableColumns(action)).toEqual(["name", "email"]);
  });

  it("returns undefined when rules have no triggerColumn", () => {
    const action: ClickAction = {
      type: "set-parameter",
      rules: [
        { id: "r1", type: "set-parameter", parameterMapping: { parameterName: "x", sourceField: "name" } },
      ],
    };
    expect(deriveClickableColumns(action)).toBeUndefined();
  });

  it("filters out rules without triggerColumn", () => {
    const action: ClickAction = {
      type: "set-parameter",
      rules: [
        { id: "r1", triggerColumn: "name", type: "set-parameter", parameterMapping: { parameterName: "x", sourceField: "name" } },
        { id: "r2", type: "set-parameter", parameterMapping: { parameterName: "y", sourceField: "email" } },
      ],
    };
    expect(deriveClickableColumns(action)).toEqual(["name"]);
  });
});
