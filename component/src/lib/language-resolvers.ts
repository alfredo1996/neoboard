/**
 * Language resolver registry for the unified CodeMirror 6 editor.
 *
 * Each supported editor language provides a resolver: an async factory that
 * returns CM6 extensions for that language. Resolvers use dynamic import()
 * so heavy grammar/parser code is only loaded when actually needed.
 *
 * Adding a new connector = adding one entry to the `languageResolvers` registry.
 * Connector types (e.g., "neo4j", "postgresql") can be used directly as
 * language keys — the registry maps them to the right editor extension.
 */
import type { Extension } from "@codemirror/state";
import { toSqlSchema, toCypherDbSchema } from "./schema-transforms";
import type { DatabaseSchema } from "./schema-transforms";

/**
 * A language resolver is an async factory that returns CM6 extensions for a
 * given language. Every supported editor language must provide one.
 *
 * The function receives the optional DatabaseSchema (which may contain SQL
 * tables, Neo4j labels, or future connector metadata) and returns the
 * LanguageSupport extension(s) for that language — including syntax
 * highlighting, autocompletion, and optional linting.
 */
export type LanguageResolver = (
  schema?: DatabaseSchema,
) => Promise<Extension[]>;

/**
 * Registry of supported languages, keyed by language name OR connector type.
 *
 * Connector types ("neo4j", "postgresql") are registered as aliases so the
 * widget editor can pass `selectedConnection.type` directly as the language
 * prop — no manual mapping needed.
 *
 * Adding a new connector = adding one resolver entry (or alias).
 * Each resolver uses dynamic import() so heavy grammar/parser code is
 * only loaded when the language is actually used.
 */
export const languageResolvers: Record<string, LanguageResolver> = {
  cypher: async (schema) => {
    const { cypher } = await import("./cypher-lang");
    const cypherSchema =
      schema?.type === "neo4j" ? toCypherDbSchema(schema) : undefined;
    return [cypher({ schema: cypherSchema })];
  },

  sql: async (schema) => {
    const { sql, PostgreSQL } = await import("@codemirror/lang-sql");
    if (schema?.tables) {
      return [sql({ dialect: PostgreSQL, schema: toSqlSchema(schema) })];
    }
    return [sql({ dialect: PostgreSQL })];
  },

  // Connector-type aliases — so connection.type can be passed directly
  neo4j: async (schema) => languageResolvers.cypher(schema),
  postgresql: async (schema) => languageResolvers.sql(schema),
};

/**
 * Resolve a language string to CM6 extensions. Falls back to SQL if the
 * language is not registered.
 */
export async function resolveLanguageExt(
  language: string,
  schema?: DatabaseSchema,
): Promise<Extension[]> {
  const key = language.toLowerCase();
  const resolver = languageResolvers[key] ?? languageResolvers.sql;
  return resolver(schema);
}
