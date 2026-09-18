/**
 * Language resolver registry tests.
 *
 * Verifies that:
 * - resolveLanguageExt("sql") calls sql() from @codemirror/lang-sql
 * - resolveLanguageExt("cypher") calls cypher() from @neo4j-cypher/react-codemirror
 * - resolveLanguageExt("unknown") falls back to plain text (no extensions)
 * - the registry is keyed by query LANGUAGE only — no connector-type aliases
 * - SQL resolver passes schema through toSqlSchema() when schema has tables
 * - Cypher resolver passes schema through toCypherDbSchema() when the schema
 *   has a graph SHAPE (labels / relationshipTypes), whatever its `type` says
 * - Cypher resolver passes undefined schema for a schema without graph shape
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DatabaseSchema } from "../schema-transforms";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mocks accept any args
const mockSql = vi.fn<(...args: any[]) => object[]>(() => [
  { type: "sqlLanguageSupport" },
]);
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mocks accept any args
const mockCypher = vi.fn<(...args: any[]) => object>(() => ({
  type: "cypherLanguageSupport",
}));

vi.mock("@codemirror/lang-sql", () => ({
  sql: (...args: unknown[]) => mockSql(...args),
  PostgreSQL: { name: "PostgreSQL" },
}));

vi.mock("@/lib/cypher-lang", () => ({
  cypher: (...args: unknown[]) => mockCypher(...args),
}));

// Import AFTER mocks
const { resolveLanguageExt, languageResolvers } =
  await import("../language-resolvers");

beforeEach(() => {
  mockSql.mockClear();
  mockCypher.mockClear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("resolveLanguageExt", () => {
  it("returns an Extension array for sql", async () => {
    const exts = await resolveLanguageExt("sql");
    expect(Array.isArray(exts)).toBe(true);
    expect(exts.length).toBeGreaterThan(0);
  });

  it("calls sql() from @codemirror/lang-sql for sql language", async () => {
    await resolveLanguageExt("sql");
    expect(mockSql).toHaveBeenCalled();
  });

  it("calls cypher() from @neo4j-cypher/react-codemirror for cypher language", async () => {
    await resolveLanguageExt("cypher");
    expect(mockCypher).toHaveBeenCalled();
  });

  it("falls back to plain text (no extensions) for unknown languages", async () => {
    const exts = await resolveLanguageExt("unknown-lang");
    expect(exts).toEqual([]);
    expect(mockSql).not.toHaveBeenCalled();
    expect(mockCypher).not.toHaveBeenCalled();
  });

  it("falls back to plain text for an empty/undeclared language", async () => {
    const exts = await resolveLanguageExt("");
    expect(exts).toEqual([]);
    expect(mockSql).not.toHaveBeenCalled();
    expect(mockCypher).not.toHaveBeenCalled();
  });

  it("falls back to plain text for prototype-inherited keys like __proto__", async () => {
    const exts = await resolveLanguageExt("__proto__");
    expect(exts).toEqual([]);
    expect(mockSql).not.toHaveBeenCalled();
    expect(mockCypher).not.toHaveBeenCalled();
  });

  it("falls back to plain text for constructor key", async () => {
    const exts = await resolveLanguageExt("constructor");
    expect(exts).toEqual([]);
    expect(mockSql).not.toHaveBeenCalled();
    expect(mockCypher).not.toHaveBeenCalled();
  });

  it("is case-insensitive", async () => {
    await resolveLanguageExt("SQL");
    expect(mockSql).toHaveBeenCalled();

    mockSql.mockClear();
    mockCypher.mockClear();

    await resolveLanguageExt("CYPHER");
    expect(mockCypher).toHaveBeenCalled();
  });

  it("passes schema through toSqlSchema when schema has tables", async () => {
    const schema: DatabaseSchema = {
      type: "any-tabular-connector",
      tables: [
        {
          name: "users",
          columns: [{ name: "id", type: "integer", nullable: false }],
        },
      ],
    };

    await resolveLanguageExt("sql", schema);

    expect(mockSql).toHaveBeenCalled();
    const callArgs = mockSql.mock.calls[0] as unknown[];
    const arg = callArgs[0] as Record<string, unknown>;
    expect(arg).toHaveProperty("schema");
    expect(arg.schema).toEqual({ users: ["id"] });
  });

  it("calls sql with dialect only when schema has no tables", async () => {
    const schema: DatabaseSchema = { type: "any-tabular-connector" };

    await resolveLanguageExt("sql", schema);

    expect(mockSql).toHaveBeenCalled();
    const callArgs = mockSql.mock.calls[0] as unknown[];
    const arg = callArgs[0] as Record<string, unknown>;
    expect(arg).toHaveProperty("dialect");
    expect(arg).not.toHaveProperty("schema");
  });

  it("passes schema through toCypherDbSchema when the schema has a graph shape", async () => {
    const schema: DatabaseSchema = {
      type: "any-graph-connector",
      labels: ["Person"],
      relationshipTypes: ["KNOWS"],
      nodeProperties: {
        Person: [{ name: "name", type: "String" }],
      },
    };

    await resolveLanguageExt("cypher", schema);

    expect(mockCypher).toHaveBeenCalled();
    const callArgs = mockCypher.mock.calls[0] as unknown[];
    const arg = callArgs[0] as Record<string, unknown>;
    expect(arg).toHaveProperty("schema");
    // Verify toCypherDbSchema was applied (labels, relationshipTypes, propertyKeys)
    const cypherSchema = arg.schema as Record<string, unknown>;
    expect(cypherSchema).toHaveProperty("labels");
    expect(cypherSchema).toHaveProperty("relationshipTypes");
    expect(cypherSchema).toHaveProperty("propertyKeys");
  });

  it("keys the cypher schema on shape: relationshipTypes alone is enough", async () => {
    await resolveLanguageExt("cypher", {
      type: "any-graph-connector",
      relationshipTypes: ["KNOWS"],
    });

    const arg = (mockCypher.mock.calls[0] as unknown[])[0] as {
      schema?: { relationshipTypes?: string[] };
    };
    expect(arg.schema?.relationshipTypes).toEqual(["KNOWS"]);
  });

  it("passes undefined schema to cypher when the schema has no graph shape", async () => {
    const schema: DatabaseSchema = {
      type: "any-tabular-connector",
      tables: [
        {
          name: "users",
          columns: [{ name: "id", type: "integer", nullable: false }],
        },
      ],
    };

    await resolveLanguageExt("cypher", schema);

    expect(mockCypher).toHaveBeenCalled();
    const callArgs = mockCypher.mock.calls[0] as unknown[];
    const arg = callArgs[0] as Record<string, unknown>;
    expect(arg.schema).toBeUndefined();
  });
});

describe("languageResolvers registry", () => {
  it("is keyed by query language only — no connector-type aliases (#1895)", () => {
    expect(Object.keys(languageResolvers).sort()).toEqual(["cypher", "sql"]);
  });

  it("each entry is a function", () => {
    expect(typeof languageResolvers.cypher).toBe("function");
    expect(typeof languageResolvers.sql).toBe("function");
  });
});
