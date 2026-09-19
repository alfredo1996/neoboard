import { describe, it, expect } from "vitest";
import { editorLanguageForConnector } from "@/lib/connector/editor-language";

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
