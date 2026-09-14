import { describe, it, expect } from "vitest";
import { seedQueriesOf } from "../seed-queries";

/**
 * #1814: the seed queries behind a widget's option lists, read where
 * use-widget-save.ts stores them. The view-share query allowlist is built from
 * this, so it must read the real paths and nothing else.
 */
describe("seedQueriesOf", () => {
  it("reads a parameter selector's seed query from chartOptions", () => {
    expect(seedQueriesOf({ chartOptions: { seedQuery: "A" } })).toEqual(["A"]);
  });

  it("reads every form field's seed query", () => {
    expect(
      seedQueriesOf({
        chartOptions: {},
        formFields: [
          { seedQuery: "A" },
          { parameterName: "x" },
          { seedQuery: "B" },
        ],
      }),
    ).toEqual(["A", "B"]);
  });

  it("reads only seedQuery from chartOptions, no other option strings", () => {
    expect(
      seedQueriesOf({
        chartOptions: {
          seedQuery: "A",
          parameterName: "B",
          parameterType: "select",
          clickAction: "C",
        },
      }),
    ).toEqual(["A"]);
  });

  it("does not read a top-level settings.seedQuery, which is never saved", () => {
    expect(seedQueriesOf({ seedQuery: "A" })).toEqual([]);
  });

  it("tolerates missing and malformed settings", () => {
    expect(seedQueriesOf(undefined)).toEqual([]);
    expect(seedQueriesOf({ chartOptions: null, formFields: "nope" })).toEqual(
      [],
    );
    expect(
      seedQueriesOf({
        chartOptions: { seedQuery: 5 },
        formFields: [null, { seedQuery: {} }],
      }),
    ).toEqual([]);
  });
});
