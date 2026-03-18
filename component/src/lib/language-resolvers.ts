/**
 * Language resolver registry for the unified CodeMirror 6 editor.
 *
 * Each supported editor language provides a resolver: an async factory that
 * returns CM6 extensions for that language. Resolvers use dynamic import()
 * so heavy grammar/parser code is only loaded when actually needed.
 *
 * Adding a new language = adding one entry to the `languageResolvers` registry.
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
 * Registry of supported languages. Adding a new language = adding one entry.
 *
 * Each resolver uses dynamic import() so the heavy grammar/parser code is
 * only loaded when the language is actually used.
 */
export const languageResolvers: Record<string, LanguageResolver> = {
  cypher: async (schema) => {
    // Import from the specific lang-cypher subpath to avoid pulling in
    // CypherEditor → syntaxValidation → workerpool → child_process,
    // which breaks the Next.js/webpack build (no Node.js builtins in browser).
    const { cypher } = await import(
      "@neo4j-cypher/react-codemirror/dist/src/lang-cypher/langCypher"
    );
    const cypherSchema =
      schema?.type === "neo4j" ? toCypherDbSchema(schema) : undefined;
    return [
      cypher({ lint: false, schema: cypherSchema, useLightVersion: false }),
    ];
  },

  sql: async (schema) => {
    const { sql, PostgreSQL } = await import("@codemirror/lang-sql");
    if (schema?.tables) {
      return [sql({ dialect: PostgreSQL, schema: toSqlSchema(schema) })];
    }
    return [sql({ dialect: PostgreSQL })];
  },

  postgresql: async (schema) => {
    // Alias — delegates to sql resolver
    return languageResolvers.sql(schema);
  },
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
