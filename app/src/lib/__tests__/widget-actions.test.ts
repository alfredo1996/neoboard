import { describe, it, expect } from "vitest";
import {
  buildClickActionConfig,
  buildStylingConfigFromEditor,
  isDataWidget,
} from "../widget-actions";
import type { ClickActionRule, StylingRule } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// buildClickActionConfig
// ---------------------------------------------------------------------------
describe("buildClickActionConfig", () => {
  const base = {
    clickActionEnabled: true,
    clickActionType: "set-parameter" as const,
    parameterName: "myParam",
    sourceField: "name",
    chartType: "bar",
    targetPageId: "",
  };

  it("returns undefined when disabled", () => {
    expect(
      buildClickActionConfig({ ...base, clickActionEnabled: false }),
    ).toBeUndefined();
  });

  it("returns undefined for unsupported chart type", () => {
    expect(
      buildClickActionConfig({ ...base, chartType: "markdown" }),
    ).toBeUndefined();
  });

  it("returns undefined when set-parameter has no parameterName", () => {
    expect(
      buildClickActionConfig({ ...base, parameterName: "" }),
    ).toBeUndefined();
  });

  it("returns undefined when set-parameter has no sourceField for non-table chart", () => {
    expect(
      buildClickActionConfig({ ...base, sourceField: "" }),
    ).toBeUndefined();
  });

  it("allows empty sourceField for table chart (set-parameter)", () => {
    const result = buildClickActionConfig({
      ...base,
      chartType: "table",
      sourceField: "",
    });
    expect(result).toBeDefined();
    expect(result!.parameterMapping!.sourceField).toBe("");
  });

  it("returns undefined when navigate-to-page has no targetPageId", () => {
    expect(
      buildClickActionConfig({
        ...base,
        clickActionType: "navigate-to-page",
        targetPageId: "",
      }),
    ).toBeUndefined();
  });

  it("returns undefined when targetPageId is not in layout pages", () => {
    expect(
      buildClickActionConfig({
        ...base,
        clickActionType: "navigate-to-page",
        targetPageId: "page-999",
        layout: {
          version: 2,
          pages: [
            { id: "page-1", title: "Page 1", widgets: [], gridLayout: [] },
          ],
        },
      }),
    ).toBeUndefined();
  });

  it("returns ClickAction with parameterMapping for set-parameter", () => {
    const result = buildClickActionConfig(base);
    expect(result).toEqual({
      type: "set-parameter",
      parameterMapping: {
        parameterName: "myParam",
        sourceField: "name",
      },
    });
  });

  it("returns ClickAction with targetPageId for navigate-to-page", () => {
    const result = buildClickActionConfig({
      ...base,
      clickActionType: "navigate-to-page",
      parameterName: "",
      sourceField: "",
      targetPageId: "page-1",
      layout: {
        version: 2,
        pages: [{ id: "page-1", title: "Page 1", widgets: [], gridLayout: [] }],
      },
    });
    expect(result).toEqual({
      type: "navigate-to-page",
      targetPageId: "page-1",
    });
  });

  it("returns ClickAction with both for set-parameter-and-navigate", () => {
    const result = buildClickActionConfig({
      ...base,
      clickActionType: "set-parameter-and-navigate",
      targetPageId: "page-1",
      layout: {
        version: 2,
        pages: [{ id: "page-1", title: "Page 1", widgets: [], gridLayout: [] }],
      },
    });
    expect(result).toEqual({
      type: "set-parameter-and-navigate",
      parameterMapping: {
        parameterName: "myParam",
        sourceField: "name",
      },
      targetPageId: "page-1",
    });
  });

  it("includes clickableColumns for table chart", () => {
    const result = buildClickActionConfig({
      ...base,
      chartType: "table",
      clickableColumns: ["id", "name"],
    });
    expect(result).toBeDefined();
    expect(result!.clickableColumns).toEqual(["id", "name"]);
  });

  it("uses actionRules instead of single mapping when rules provided", () => {
    const rules: ClickActionRule[] = [
      {
        id: "r1",
        type: "set-parameter",
        parameterMapping: { parameterName: "p1", sourceField: "col1" },
      },
    ];
    const result = buildClickActionConfig({
      ...base,
      actionRules: rules,
    });
    expect(result).toBeDefined();
    expect(result!.rules).toEqual(rules);
    expect(result!.type).toBe("set-parameter");
    // When rules are present, single parameterMapping should not be set
    expect(result!.parameterMapping).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// buildStylingConfigFromEditor
// ---------------------------------------------------------------------------
describe("buildStylingConfigFromEditor", () => {
  const sampleRule: StylingRule = {
    id: "r1",
    operator: "<=",
    value: 100,
    color: "#ff0000",
    target: "color",
  };

  it("returns undefined when disabled", () => {
    expect(
      buildStylingConfigFromEditor({
        stylingEnabled: false,
        chartType: "bar",
        stylingRules: [sampleRule],
      }),
    ).toBeUndefined();
  });

  it("returns undefined for unsupported chart type", () => {
    expect(
      buildStylingConfigFromEditor({
        stylingEnabled: true,
        chartType: "graph",
        stylingRules: [sampleRule],
      }),
    ).toBeUndefined();
  });

  it("returns undefined when rules array is empty", () => {
    expect(
      buildStylingConfigFromEditor({
        stylingEnabled: true,
        chartType: "bar",
        stylingRules: [],
      }),
    ).toBeUndefined();
  });

  it("returns { enabled: true, rules } when valid", () => {
    expect(
      buildStylingConfigFromEditor({
        stylingEnabled: true,
        chartType: "bar",
        stylingRules: [sampleRule],
      }),
    ).toEqual({ enabled: true, rules: [sampleRule] });
  });
});

// ---------------------------------------------------------------------------
// isDataWidget
// ---------------------------------------------------------------------------
describe("isDataWidget", () => {
  it("returns true for data-producing widget types", () => {
    expect(isDataWidget("bar")).toBe(true);
  });

  it("returns false for markdown (content-only)", () => {
    expect(isDataWidget("markdown")).toBe(false);
  });

  it("returns false for parameter-select (content-only)", () => {
    expect(isDataWidget("parameter-select")).toBe(false);
  });
});
