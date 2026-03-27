/**
 * Smoke tests for the vendored cypher-lang module.
 *
 * These tests verify that the vendored wrapper code loads without errors
 * and that utility/constant exports are correct. The ANTLR parser
 * (@neo4j-cypher/language-support) is mocked because it has ESM
 * resolution issues in Vitest's Node environment.
 */
import { describe, it, expect, vi } from "vitest";

// Mock the language-support library that has ESM resolution issues in Node
vi.mock("@neo4j-cypher/language-support", () => ({
  applySyntaxColouring: vi.fn(() => []),
  testData: { DbSchema: {} },
}));

// ---------------------------------------------------------------------------
// utils — getDocString (no dependency on language-support)
// ---------------------------------------------------------------------------
describe("getDocString", () => {
  it("returns a plain string as-is", async () => {
    const { getDocString } = await import("../utils");
    expect(getDocString("hello")).toBe("hello");
  });

  it("extracts value from MarkupContent object", async () => {
    const { getDocString } = await import("../utils");
    const markup = { kind: "markdown" as const, value: "# Title" };
    expect(getDocString(markup)).toBe("# Title");
  });
});

// ---------------------------------------------------------------------------
// constants — token type mappings
// ---------------------------------------------------------------------------
describe("constants", () => {
  it("cypherTokenTypeToNode creates all expected node types", async () => {
    const { defineLanguageFacet } = await import("@codemirror/language");
    const { cypherTokenTypeToNode } = await import("../constants");

    const facet = defineLanguageFacet({
      commentTokens: { block: { open: "/*", close: "*/" }, line: "//" },
    });
    const nodes = cypherTokenTypeToNode(facet);

    const expectedNames = [
      "topNode",
      "comment",
      "keyword",
      "label",
      "variable",
      "operator",
      "stringLiteral",
      "numberLiteral",
      "booleanLiteral",
      "property",
      "bracket",
      "none",
    ];
    for (const name of expectedNames) {
      expect(nodes).toHaveProperty(name);
    }
  });

  it("node IDs are unique", async () => {
    const { defineLanguageFacet } = await import("@codemirror/language");
    const { cypherTokenTypeToNode } = await import("../constants");

    const facet = defineLanguageFacet({
      commentTokens: { block: { open: "/*", close: "*/" }, line: "//" },
    });
    const nodes = cypherTokenTypeToNode(facet);
    const ids = Object.values(nodes).map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("tokenTypeToStyleTag has entries for all highlighted types", async () => {
    const { tokenTypeToStyleTag } = await import("../constants");
    expect(Object.keys(tokenTypeToStyleTag).length).toBeGreaterThanOrEqual(20);
    expect(tokenTypeToStyleTag.keyword).toBeDefined();
    expect(tokenTypeToStyleTag.comment).toBeDefined();
    expect(tokenTypeToStyleTag.stringLiteral).toBeDefined();
  });

  it("parserAdapterNodeSet creates a valid NodeSet", async () => {
    const { defineLanguageFacet } = await import("@codemirror/language");
    const { cypherTokenTypeToNode, parserAdapterNodeSet } =
      await import("../constants");

    const facet = defineLanguageFacet({
      commentTokens: { block: { open: "/*", close: "*/" }, line: "//" },
    });
    const nodes = cypherTokenTypeToNode(facet);
    const nodeSet = parserAdapterNodeSet(nodes);
    expect(nodeSet).toBeDefined();
    expect(nodeSet.types.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// ParserAdapter — syntax tree generation (with mocked language-support)
// ---------------------------------------------------------------------------
describe("ParserAdapter", () => {
  it("parses an empty string without throwing", async () => {
    const { defineLanguageFacet } = await import("@codemirror/language");
    const { ParserAdapter } = await import("../parser-adapter");

    const facet = defineLanguageFacet({
      commentTokens: { block: { open: "/*", close: "*/" }, line: "//" },
    });
    const adapter = new ParserAdapter(facet, {});
    const parse = adapter.startParse("");
    const tree = parse.advance();
    expect(tree).toBeDefined();
  });

  it("parses a simple query string (mocked tokenizer)", async () => {
    const { defineLanguageFacet } = await import("@codemirror/language");
    const { ParserAdapter } = await import("../parser-adapter");

    const facet = defineLanguageFacet({
      commentTokens: { block: { open: "/*", close: "*/" }, line: "//" },
    });
    const adapter = new ParserAdapter(facet, {});
    const query = "MATCH (n) RETURN n";
    const parse = adapter.startParse(query);
    expect(parse.parsedPos).toBe(query.length);
    const tree = parse.advance();
    expect(tree).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Module index — re-exports
// ---------------------------------------------------------------------------
describe("cypher-lang index", () => {
  it("exports cypher function", async () => {
    const { cypher } = await import("../index");
    expect(cypher).toBeDefined();
    expect(typeof cypher).toBe("function");
  });
});
