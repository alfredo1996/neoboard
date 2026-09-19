/**
 * Language resolver registry for the unified CodeMirror 6 editor.
 *
 * Each supported editor language provides a resolver: an async factory that
 * returns CM6 extensions for that language. Resolvers use dynamic import()
 * so heavy grammar/parser code is only loaded when actually needed.
 *
 * The registry is keyed by query LANGUAGE, never by connector type: a
 * connector declares its `queryLanguage` and the app passes that here. A new
 * connector that speaks an existing language needs no change in this file;
 * a new language = one new resolver entry.
 */
import type { Extension } from "@codemirror/state";
import { toSqlSchema, toCypherDbSchema } from "./schema-transforms";
import type { DatabaseSchema } from "./schema-transforms";

/**
 * A language resolver is an async factory that returns CM6 extensions for a
 * given language. Every supported editor language must provide one.
 *
 * The function receives the optional DatabaseSchema (which may carry a
 * tabular shape, a graph shape, or future connector metadata) and returns the
 * LanguageSupport extension(s) for that language — including syntax
 * highlighting, autocompletion, and optional linting.
 */
export type LanguageResolver = (
  schema?: DatabaseSchema,
) => Promise<Extension[]>;

/**
 * Registry of supported languages, keyed by language name.
 *
 * Each resolver uses dynamic import() so heavy grammar/parser code is
 * only loaded when the language is actually used.
 */
export const languageResolvers: Record<string, LanguageResolver> = {
  cypher: async (schema) => {
    const { cypher } = await import("./cypher-lang");
    // Keyed on the schema's SHAPE, not on which connector produced it (#1895).
    const cypherSchema =
      schema?.labels || schema?.relationshipTypes
        ? toCypherDbSchema(schema)
        : undefined;
    return [cypher({ schema: cypherSchema })];
  },

  sql: async (schema) => {
    const { sql, PostgreSQL } = await import("@codemirror/lang-sql");
    if (schema?.tables) {
      return [sql({ dialect: PostgreSQL, schema: toSqlSchema(schema) })];
    }
    return [sql({ dialect: PostgreSQL })];
  },
};

/**
 * Resolve a language string to CM6 extensions. Falls back to plain text
 * (no language extension, no highlighting) when the language is not
 * registered — so a registry-supplied connector that declares an unknown
 * or no `queryLanguage` gets a neutral editor rather than misleading SQL
 * highlighting (#1120).
 */
export async function resolveLanguageExt(
  language: string,
  schema?: DatabaseSchema,
): Promise<Extension[]> {
  const key = language.toLowerCase();
  if (!Object.hasOwn(languageResolvers, key)) return [];
  return languageResolvers[key](schema);
}
