import { describe, it, expect } from "vitest";
import {
  isNeoDashFormat,
  convertNeoDashWithNotes,
  inferParameterType,
  extractParamReferences,
} from "@/lib/dashboard/neodash-converter";

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function makeReport(
  overrides: Partial<{
    id: string;
    title: string;
    type: string;
    query: string;
    settings: Record<string, unknown>;
  }> = {},
) {
  return {
    id: overrides.id ?? "r1",
    title: overrides.title ?? "Report",
    type: overrides.type ?? "table",
    query: overrides.query ?? "MATCH (n) RETURN n",
    x: 0,
    y: 0,
    width: 6,
    height: 4,
    settings: overrides.settings ?? {},
    parameters: {},
  };
}

function makeNeoDash(
  reports: ReturnType<typeof makeReport>[],
  settings?: { parameters?: Record<string, unknown> },
) {
  return {
    title: "Test Dashboard",
    version: "2.4",
    pages: [
      {
        title: "Page 1",
        reports,
      },
    ],
    ...(settings ? { settings } : {}),
  };
}

// ---------------------------------------------------------------------------
// isNeoDashFormat
// ---------------------------------------------------------------------------

describe("isNeoDashFormat", () => {
  it("recognizes a NeoDash v2.x dashboard", () => {
    expect(isNeoDashFormat(makeNeoDash([makeReport()]))).toBe(true);
  });

  it("rejects null / undefined / non-objects", () => {
    expect(isNeoDashFormat(null)).toBe(false);
    expect(isNeoDashFormat(undefined)).toBe(false);
    expect(isNeoDashFormat("string")).toBe(false);
    expect(isNeoDashFormat(42)).toBe(false);
  });

  it("rejects arrays", () => {
    expect(isNeoDashFormat([])).toBe(false);
  });

  it("rejects objects without pages", () => {
    expect(isNeoDashFormat({ title: "x" })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// inferParameterType
// ---------------------------------------------------------------------------

describe("inferParameterType", () => {
  it("returns multi-select for arrays", () => {
    expect(inferParameterType([])).toBe("multi-select");
    expect(inferParameterType(["a", "b"])).toBe("multi-select");
  });

  it("returns number-range for finite numbers", () => {
    expect(inferParameterType(0)).toBe("number-range");
    expect(inferParameterType(42)).toBe("number-range");
    expect(inferParameterType(3.14)).toBe("number-range");
  });

  it("does not return number-range for NaN / Infinity", () => {
    expect(inferParameterType(Number.NaN)).toBe("select");
    expect(inferParameterType(Number.POSITIVE_INFINITY)).toBe("select");
  });

  it("returns text for empty string", () => {
    expect(inferParameterType("")).toBe("text");
  });

  it("returns select for non-empty strings (NeoDash's most common case)", () => {
    expect(inferParameterType("foo")).toBe("select");
    expect(inferParameterType("Y")).toBe("select");
    expect(inferParameterType("N")).toBe("select");
  });

  it("returns select for null / undefined / objects", () => {
    expect(inferParameterType(null)).toBe("select");
    expect(inferParameterType(undefined)).toBe("select");
    expect(inferParameterType({})).toBe("select");
  });
});

// ---------------------------------------------------------------------------
// extractParamReferences
// ---------------------------------------------------------------------------

describe("extractParamReferences", () => {
  it("extracts $param_xxx names from queries", () => {
    const refs = extractParamReferences([
      "MATCH (n) WHERE n.name = $param_userName RETURN n",
      "MATCH (m) WHERE m.year > $param_year RETURN m",
    ]);
    expect([...refs].sort()).toEqual(["userName", "year"]);
  });

  it("returns unique names when referenced multiple times", () => {
    const refs = extractParamReferences(["$param_x + $param_x + $param_y"]);
    expect([...refs].sort()).toEqual(["x", "y"]);
  });

  it("ignores $paramX without underscore", () => {
    const refs = extractParamReferences(["$paramFoo"]);
    expect(refs.size).toBe(0);
  });

  it("ignores bare param_xxx without leading $", () => {
    const refs = extractParamReferences(["param_foo"]);
    expect(refs.size).toBe(0);
  });

  it("skips empty / undefined queries", () => {
    const refs = extractParamReferences(["", "$param_x"]);
    expect([...refs]).toEqual(["x"]);
  });
});

// ---------------------------------------------------------------------------
// convertNeoDashWithNotes — markdown content
// ---------------------------------------------------------------------------

describe("convertNeoDashWithNotes — markdown widgets", () => {
  it("moves text report.query into settings.content and clears widget.query", () => {
    const nd = makeNeoDash([
      makeReport({
        type: "text",
        title: "Welcome",
        query: "## Hello\n\nMarkdown content here.",
      }),
    ]);

    const { export: exp, notes } = convertNeoDashWithNotes(nd);
    const widget = exp.layout.pages[0].widgets[0];

    expect(widget.chartType).toBe("markdown");
    expect(widget.query).toBe("");
    expect((widget.settings as Record<string, unknown>).content).toBe(
      "## Hello\n\nMarkdown content here.",
    );
    expect(notes).toContain('Imported markdown content for "Welcome"');
  });

  it("handles 'markdown' type the same as 'text'", () => {
    const nd = makeNeoDash([
      makeReport({
        type: "markdown",
        title: "Notes",
        query: "**bold**",
      }),
    ]);

    const { export: exp } = convertNeoDashWithNotes(nd);
    const widget = exp.layout.pages[0].widgets[0];
    expect(widget.chartType).toBe("markdown");
    expect(widget.query).toBe("");
    expect((widget.settings as Record<string, unknown>).content).toBe(
      "**bold**",
    );
  });

  it("does not add a markdown note when report.query is empty", () => {
    const nd = makeNeoDash([
      makeReport({ type: "text", title: "Empty MD", query: "" }),
    ]);
    const { notes } = convertNeoDashWithNotes(nd);
    expect(notes.some((n) => n.includes("Imported markdown content"))).toBe(
      false,
    );
  });

  it("leaves non-markdown widgets' query in place (no settings.content)", () => {
    const nd = makeNeoDash([
      makeReport({
        type: "bar",
        title: "Bar",
        query: "MATCH (n) RETURN n.year, count(*)",
      }),
    ]);
    const widget =
      convertNeoDashWithNotes(nd).export.layout.pages[0].widgets[0];
    expect(widget.query).toBe("MATCH (n) RETURN n.year, count(*)");
    expect(
      (widget.settings as Record<string, unknown>).content,
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// convertNeoDashWithNotes — parameter widgets
// ---------------------------------------------------------------------------

describe("convertNeoDashWithNotes — parameter widgets", () => {
  it("creates a parameter-select widget for each referenced + defined param", () => {
    const nd = makeNeoDash(
      [
        makeReport({
          query: "MATCH (n) WHERE n.year = $neodash_year RETURN n",
        }),
      ],
      { parameters: { neodash_year: 2024 } },
    );

    const { export: exp, notes } = convertNeoDashWithNotes(nd);
    expect(exp.layout.pages).toHaveLength(2); // Filters + original
    expect(exp.layout.pages[0].title).toBe("Filters");
    const filterWidget = exp.layout.pages[0].widgets[0];
    expect(filterWidget.chartType).toBe("parameter-select");
    const s = filterWidget.settings as Record<string, unknown>;
    expect(s.parameterName).toBe("year");
    expect(s.parameterType).toBe("number-range");
    expect(s.defaultValue).toBe(2024);
    expect(notes.some((n) => n.includes("$param_year"))).toBe(true);

    // Verify the original widget's query was rewritten from $neodash_year
    // → $param_year (CR finding: the test asserted filter creation but not
    // the parallel query-syntax conversion).
    const originalWidget = exp.layout.pages[1].widgets[0];
    expect(originalWidget.query).toContain("$param_year");
    expect(originalWidget.query).not.toContain("$neodash_year");
  });

  it("skips parameters that are defined but never referenced", () => {
    const nd = makeNeoDash([makeReport({ query: "MATCH (n) RETURN n" })], {
      parameters: { neodash_unused: "x", neodash_other: 5 },
    });

    const { export: exp, notes } = convertNeoDashWithNotes(nd);
    expect(exp.layout.pages).toHaveLength(1); // No Filters page
    expect(notes.filter((n) => n.includes("never referenced"))).toHaveLength(2);
  });

  it("creates parameter-select for referenced-but-undefined params with a warning note", () => {
    // Use realistic NeoDash syntax — convertParamSyntax rewrites it to $param_,
    // and the extractor sees the rewritten form (CR finding: tests should
    // exercise the conversion path, not bypass it).
    const nd = makeNeoDash([
      makeReport({
        query: "MATCH (n) WHERE n.name = $neodash_undeclared RETURN n",
      }),
    ]);

    const { export: exp, notes } = convertNeoDashWithNotes(nd);
    expect(exp.layout.pages).toHaveLength(2);
    const filterWidget = exp.layout.pages[0].widgets[0];
    expect(
      (filterWidget.settings as Record<string, unknown>).parameterName,
    ).toBe("undeclared");
    expect(
      (filterWidget.settings as Record<string, unknown>).defaultValue,
    ).toBeUndefined();
    expect(notes.some((n) => n.includes("not defined in NeoDash"))).toBe(true);
  });

  it("infers types correctly per default value", () => {
    // Use real NeoDash $neodash_ syntax so the conversion path is exercised
    // (CR finding: pre-converted $param_ bypasses convertParamSyntax).
    const nd = makeNeoDash(
      [
        makeReport({
          query:
            "$neodash_str $neodash_emp $neodash_arr $neodash_num $neodash_yn",
        }),
      ],
      {
        parameters: {
          neodash_str: "value",
          neodash_emp: "",
          neodash_arr: ["a"],
          neodash_num: 10,
          neodash_yn: "Y",
        },
      },
    );

    const { export: exp } = convertNeoDashWithNotes(nd);
    const byName = Object.fromEntries(
      exp.layout.pages[0].widgets.map((w) => [
        (w.settings as Record<string, unknown>).parameterName as string,
        (w.settings as Record<string, unknown>).parameterType as string,
      ]),
    );
    expect(byName.str).toBe("select");
    expect(byName.emp).toBe("text");
    expect(byName.arr).toBe("multi-select");
    expect(byName.num).toBe("number-range");
    expect(byName.yn).toBe("select");
  });

  it("strips the 'neodash_' prefix from parameter names", () => {
    const nd = makeNeoDash([makeReport({ query: "$neodash_userId" })], {
      parameters: { neodash_userId: "alice" },
    });

    const { export: exp } = convertNeoDashWithNotes(nd);
    expect(
      (exp.layout.pages[0].widgets[0].settings as Record<string, unknown>)
        .parameterName,
    ).toBe("userId");
  });

  it("does not create a Filters page when no params are referenced", () => {
    const nd = makeNeoDash([makeReport({ query: "MATCH (n) RETURN n" })]);
    const { export: exp } = convertNeoDashWithNotes(nd);
    expect(exp.layout.pages).toHaveLength(1);
    expect(exp.layout.pages[0].title).toBe("Page 1");
  });

  it("tiles param widgets 4-per-row at w=3 h=2", () => {
    const params: Record<string, unknown> = {};
    const queryParts: string[] = [];
    for (let i = 0; i < 6; i++) {
      params[`neodash_p${i}`] = `v${i}`;
      queryParts.push(`$neodash_p${i}`);
    }
    const nd = makeNeoDash([makeReport({ query: queryParts.join(" ") })], {
      parameters: params,
    });

    const { export: exp } = convertNeoDashWithNotes(nd);
    const filtersGrid = exp.layout.pages[0].gridLayout;
    expect(filtersGrid).toHaveLength(6);
    // Row 0: 4 widgets at y=0, x=0/3/6/9
    expect(filtersGrid.slice(0, 4).map((g) => g.y)).toEqual([0, 0, 0, 0]);
    expect(filtersGrid.slice(0, 4).map((g) => g.x)).toEqual([0, 3, 6, 9]);
    // Row 1: 2 widgets at y=2, x=0/3
    expect(filtersGrid.slice(4, 6).map((g) => g.y)).toEqual([2, 2]);
    expect(filtersGrid.slice(4, 6).map((g) => g.x)).toEqual([0, 3]);
    // Every widget at w=3 h=2
    expect(filtersGrid.every((g) => g.w === 3 && g.h === 2)).toBe(true);
  });

  it("number-range pre-populates rangeMin=min(default, 0) and rangeMax=max(default, 100)", () => {
    const nd = makeNeoDash(
      [
        makeReport({
          query: "$neodash_small $neodash_big $neodash_neg",
        }),
      ],
      { parameters: { neodash_small: 5, neodash_big: 500, neodash_neg: -10 } },
    );

    const { export: exp } = convertNeoDashWithNotes(nd);
    const byName = Object.fromEntries(
      exp.layout.pages[0].widgets.map((w) => [
        (w.settings as Record<string, unknown>).parameterName as string,
        w.settings as Record<string, unknown>,
      ]),
    );
    expect(byName.small.rangeMin).toBe(0);
    expect(byName.small.rangeMax).toBe(100); // max(5, 100)
    expect(byName.big.rangeMin).toBe(0);
    expect(byName.big.rangeMax).toBe(500);
    // CR caught: negative defaults need rangeMin to widen below 0
    expect(byName.neg.rangeMin).toBe(-10);
    expect(byName.neg.rangeMax).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// convertNeoDashWithNotes — connectionId default
// ---------------------------------------------------------------------------

describe("convertNeoDashWithNotes — defaultConnectionId", () => {
  it("stamps the provided id on every widget", () => {
    const nd = makeNeoDash([makeReport({ id: "a" }), makeReport({ id: "b" })]);
    const { export: exp } = convertNeoDashWithNotes(nd, "conn-123");
    for (const w of exp.layout.pages[0].widgets) {
      expect(w.connectionId).toBe("conn-123");
    }
  });

  it("falls back to empty string when omitted", () => {
    const nd = makeNeoDash([makeReport()]);
    const { export: exp } = convertNeoDashWithNotes(nd);
    expect(exp.layout.pages[0].widgets[0].connectionId).toBe("");
  });

  it("filter widgets always have connectionId='' (no connection needed)", () => {
    const nd = makeNeoDash([makeReport({ query: "$param_x" })], {
      parameters: { neodash_x: "v" },
    });
    const { export: exp } = convertNeoDashWithNotes(nd, "conn-123");
    // Original page widgets get the stamped connection
    expect(exp.layout.pages[1].widgets[0].connectionId).toBe("conn-123");
    // Filter widgets are parameter-select, no query, no connection
    expect(exp.layout.pages[0].widgets[0].connectionId).toBe("");
  });
});

describe("convertNeoDashWithNotes — multi-rule click actions (#882)", () => {
  it("imports the first action rule and notes the dropped ones", () => {
    const nd = makeNeoDash([
      makeReport({
        type: "table",
        title: "Standard selection",
        query: "MATCH (n) RETURN n",
        settings: {
          actionsRules: [
            {
              condition: "Click",
              field: "Select",
              value: "SponsorModelIg",
              customization: "set variable",
              customizationValue: "sponsor_model",
            },
            {
              condition: "Click",
              field: "Select",
              value: "15",
              customization: "set variable",
              customizationValue: "sponsor_version_number",
            },
          ],
        },
      }),
    ]);

    const { export: exp, notes } = convertNeoDashWithNotes(nd);
    const widget = exp.layout.pages[0].widgets[0];
    const action = (widget.settings as Record<string, unknown>)
      .clickAction as Record<string, unknown>;

    // First rule imported as the single click action
    expect(action?.type).toBe("set-parameter");
    expect(
      (action.parameterMapping as Record<string, unknown>).parameterName,
    ).toBe("sponsor_model");

    // The dropped second rule is surfaced as a non-blocking note
    expect(
      notes.some(
        (n) =>
          n.includes("Standard selection") &&
          /dropped 1 .*click action/i.test(n),
      ),
    ).toBe(true);
  });

  it("does not add a dropped-rule note for a single-rule action", () => {
    const nd = makeNeoDash([
      makeReport({
        type: "table",
        title: "Single",
        query: "MATCH (n) RETURN n",
        settings: {
          actionsRules: [
            {
              condition: "Click",
              field: "Select",
              value: "x",
              customization: "set variable",
              customizationValue: "p",
            },
          ],
        },
      }),
    ]);
    const { notes } = convertNeoDashWithNotes(nd);
    expect(notes.some((n) => /dropped.*click action/i.test(n))).toBe(false);
  });
});
