import { describe, it, expect } from "vitest";
import {
  editorLanguageForConnector,
  quoteTerm,
} from "@/lib/connector/editor-language";

// What GET /api/connectors hands the browser (#1899) — fixture connectors, so
// the test says nothing about which connectors exist.
const connectors = [
  { type: "acme-graph", queryLanguage: "cypher" },
  { type: "acme-sheets", queryLanguage: "acmeql" },
  { type: "acme-files" },
];

describe("editorLanguageForConnector", () => {
  it("is the query language the connector's descriptor declares", () => {
    expect(editorLanguageForConnector(connectors, "acme-graph")).toBe("cypher");
    expect(editorLanguageForConnector(connectors, "acme-sheets")).toBe(
      "acmeql",
    );
  });

  it("is plain text for a connector that declares no language", () => {
    expect(editorLanguageForConnector(connectors, "acme-files")).toBe("");
  });

  it("is plain text for a connector that is not installed", () => {
    expect(editorLanguageForConnector(connectors, "uninstalled")).toBe("");
  });

  it("is plain text with no type, and while the descriptors load", () => {
    expect(editorLanguageForConnector(connectors)).toBe("");
    expect(editorLanguageForConnector(connectors, null)).toBe("");
    expect(editorLanguageForConnector(undefined, "acme-graph")).toBe("");
  });
});

describe("quoteTerm", () => {
  it.each([
    ["cypher", "title", "title"],
    ["cypher", "Movie", "Movie"],
    ["cypher", "_x9", "_x9"],
    ["cypher", "first name", "`first name`"],
    ["cypher", "9lives", "`9lives`"],
    ["cypher", "a-b", "`a-b`"],
    ["cypher", "we`ird", "`we``ird`"],
    ["sql", "orders", "orders"],
    ["sql", "order_items2", "order_items2"],
    ["sql", "Product Name", '"Product Name"'],
    ["sql", "Orders", '"Orders"'],
    ["sql", "2fast", '"2fast"'],
    ["sql", 'a"b', '"a""b"'],
    ["", "first name", "first name"],
    ["acmeql", "first name", "first name"],
  ])("%s: %s becomes %s", (language, name, expected) => {
    expect(quoteTerm(name, language)).toBe(expected);
  });
});
