import { describe, it, expect, vi } from "vitest";

vi.mock("@neoboard/components", () => ({}));
vi.mock("lucide-react", () => {
  const Icon = () => null;
  return {
    Calendar: Icon,
    Type: Icon,
    ListFilter: Icon,
    SlidersHorizontal: Icon,
    GitBranch: Icon,
  };
});
vi.mock("@/stores/widget-editor-store", () => ({
  useWidgetEditorStore: () => ({}),
}));

import {
  resolveInternalParamType,
  reverseParamTypeMapping,
} from "../parameter-config-section";

describe("resolveInternalParamType", () => {
  it("maps date + single to date", () => {
    expect(resolveInternalParamType("date", "single", false)).toBe("date");
  });

  it("maps date + range to date-range", () => {
    expect(resolveInternalParamType("date", "range", false)).toBe("date-range");
  });

  it("maps date + relative to date-relative", () => {
    expect(resolveInternalParamType("date", "relative", false)).toBe(
      "date-relative",
    );
  });

  it("maps freetext to text", () => {
    expect(resolveInternalParamType("freetext", "single", false)).toBe("text");
  });

  it("maps select without multi to select", () => {
    expect(resolveInternalParamType("select", "single", false)).toBe("select");
  });

  it("maps select with multi to multi-select", () => {
    expect(resolveInternalParamType("select", "single", true)).toBe(
      "multi-select",
    );
  });

  it("maps number-range to number-range (regression: #861)", () => {
    expect(resolveInternalParamType("number-range", "single", false)).toBe(
      "number-range",
    );
  });

  it("maps cascading to cascading-select (regression: #861)", () => {
    expect(resolveInternalParamType("cascading", "single", false)).toBe(
      "cascading-select",
    );
  });

  it("ignores dateSub for non-date types", () => {
    expect(resolveInternalParamType("freetext", "range", false)).toBe("text");
  });

  it("ignores multi for date types", () => {
    expect(resolveInternalParamType("date", "single", true)).toBe("date");
  });
});

describe("reverseParamTypeMapping", () => {
  it("maps date back", () => {
    expect(reverseParamTypeMapping("date")).toEqual({
      uiType: "date",
      dateSub: "single",
      multi: false,
    });
  });

  it("maps date-range back", () => {
    expect(reverseParamTypeMapping("date-range")).toEqual({
      uiType: "date",
      dateSub: "range",
      multi: false,
    });
  });

  it("maps date-relative back", () => {
    expect(reverseParamTypeMapping("date-relative")).toEqual({
      uiType: "date",
      dateSub: "relative",
      multi: false,
    });
  });

  it("maps text back", () => {
    expect(reverseParamTypeMapping("text")).toEqual({
      uiType: "freetext",
      dateSub: "single",
      multi: false,
    });
  });

  it("maps multi-select back", () => {
    expect(reverseParamTypeMapping("multi-select")).toEqual({
      uiType: "select",
      dateSub: "single",
      multi: true,
    });
  });

  it("maps select back (default case)", () => {
    expect(reverseParamTypeMapping("select")).toEqual({
      uiType: "select",
      dateSub: "single",
      multi: false,
    });
  });

  it("maps unknown type to select default", () => {
    expect(reverseParamTypeMapping("unknown")).toEqual({
      uiType: "select",
      dateSub: "single",
      multi: false,
    });
  });

  it("maps number-range back (regression: #861)", () => {
    expect(reverseParamTypeMapping("number-range")).toEqual({
      uiType: "number-range",
      dateSub: "single",
      multi: false,
    });
  });

  it("maps cascading-select back (regression: #861)", () => {
    expect(reverseParamTypeMapping("cascading-select")).toEqual({
      uiType: "cascading",
      dateSub: "single",
      multi: false,
    });
  });

  it("roundtrips with resolveInternalParamType", () => {
    const cases = [
      { ui: "date" as const, sub: "single" as const, multi: false },
      { ui: "date" as const, sub: "range" as const, multi: false },
      { ui: "date" as const, sub: "relative" as const, multi: false },
      { ui: "freetext" as const, sub: "single" as const, multi: false },
      { ui: "select" as const, sub: "single" as const, multi: false },
      { ui: "select" as const, sub: "single" as const, multi: true },
      { ui: "number-range" as const, sub: "single" as const, multi: false },
      { ui: "cascading" as const, sub: "single" as const, multi: false },
    ];
    for (const { ui, sub, multi } of cases) {
      const internal = resolveInternalParamType(ui, sub, multi);
      const reversed = reverseParamTypeMapping(internal);
      expect(reversed.uiType).toBe(ui);
      expect(reversed.multi).toBe(multi);
      if (ui === "date") expect(reversed.dateSub).toBe(sub);
    }
  });
});
