import { describe, it, expect } from "vitest";
import { editorLanguageForConnector } from "@/lib/connector/editor-language";

describe("editorLanguageForConnector", () => {
  it("maps neo4j to cypher", () => {
    expect(editorLanguageForConnector("neo4j")).toBe("cypher");
  });

  it("maps postgresql to sql", () => {
    expect(editorLanguageForConnector("postgresql")).toBe("sql");
  });

  it("returns '' (plain text) for an unknown connector type", () => {
    expect(editorLanguageForConnector("mysql")).toBe("");
  });

  it("returns '' when no type is given", () => {
    expect(editorLanguageForConnector()).toBe("");
  });
});
