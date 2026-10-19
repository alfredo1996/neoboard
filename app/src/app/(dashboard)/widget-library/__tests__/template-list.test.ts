import { describe, it, expect } from "vitest";
import {
  matchesTemplateSearch,
  templateConnectionLabel,
  templateFilters,
  templateListMeta,
} from "../template-list";

// Fixture connectors: the helper must work for a connector the app never heard of.
const CONNECTORS = [{ type: "acme-sheets", label: "Acme Sheets" }];
const CONNECTIONS = [{ id: "c1", name: "Movies graph" }];

describe("templateListMeta", () => {
  it.each([
    [4, "Reusable widgets you can drop into any dashboard · 4 templates"],
    [1, "Reusable widgets you can drop into any dashboard · 1 template"],
  ])("%i", (n, expected) => expect(templateListMeta(n)).toBe(expected));
});

describe("templateConnectionLabel", () => {
  it.each([
    [
      "the bound connection's name",
      { connectionId: "c1", connectorType: "acme-sheets" },
      "Movies graph",
    ],
    [
      "Any <label> connection when unbound",
      { connectionId: null, connectorType: "acme-sheets" },
      "Any Acme Sheets connection",
    ],
    [
      "the raw type when the connector is gone",
      { connectorType: "retired" },
      "Any retired connection",
    ],
    [
      "a dash for a content widget",
      { connectionId: null, connectorType: null },
      "—",
    ],
    [
      "not available when the bound connection is not listed",
      { connectionId: "other", connectorType: "acme-sheets" },
      "Connection not available",
    ],
  ])("%s", (_case, template, expected) => {
    expect(templateConnectionLabel(template, CONNECTIONS, CONNECTORS)).toBe(
      expected,
    );
  });
});

describe("templateFilters", () => {
  const none = { search: "", chartType: "all", connector: "all", tag: "all" };
  const names = { chartType: "Bar", connector: "Acme Sheets" };

  it("has no chip when nothing is narrowed, and ignores a blank search", () => {
    expect(templateFilters(none, names)).toEqual([]);
    expect(templateFilters({ ...none, search: "   " }, names)).toEqual([]);
  });

  it("writes each active filter as a sentence, connector by label", () => {
    expect(
      templateFilters(
        {
          search: " top ",
          chartType: "bar",
          connector: "acme-sheets",
          tag: "kpi",
        },
        names,
      ).map((f) => `${f.label} ${f.operator ?? "is"} ${f.value}`),
    ).toEqual([
      "Name or description contains top",
      "Chart is Bar",
      "Connector is Acme Sheets",
      "Tag is kpi",
    ]);
  });
});

describe("matchesTemplateSearch", () => {
  const t = { name: "Top movies", description: "By Rating" };
  it.each([
    ["the name, any case", "TOP", true],
    ["the description", "rating", true],
    ["the trimmed term, as the chip shows it", "  top ", true],
    ["neither", "zzz", false],
    ["a blank term as everything", "   ", true],
  ])("reads %s", (_, term, expected) => {
    expect(matchesTemplateSearch(t, term)).toBe(expected);
  });

  it("copes with no description", () => {
    expect(matchesTemplateSearch({ name: "A", description: null }, "b")).toBe(
      false,
    );
  });
});

describe("templateConnectionLabel while connections load", () => {
  it("names nothing yet, rather than claiming the bound connection is gone", () => {
    expect(templateConnectionLabel({ connectionId: "c1" }, undefined, [])).toBe(
      "…",
    );
  });
});
