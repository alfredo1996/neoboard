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
  /** The registry key that was asked for — lets one resolver serve several dialects. */
  language?: string,
) => Promise<Extension[]>;

/**
 * Which `@codemirror/lang-sql` dialect a language key gets (#1696). The
 * generic `sql` key keeps PostgreSQL — it is what the built-in PostgreSQL
 * connector declares, and PostgreSQL's keyword set is the broadest — so a
 * connector wanting another dialect declares it by name.
 */
const SQL_DIALECTS = {
  postgresql: "PostgreSQL",
  mysql: "MySQL",
  mariadb: "MariaSQL",
  sqlite: "SQLite",
  mssql: "MSSQL",
  plsql: "PLSQL",
  cassandra: "Cassandra",
} as const;

export type SqlDialectName =
  | (typeof SQL_DIALECTS)[keyof typeof SQL_DIALECTS]
  | "StandardSQL";

export function sqlDialectFor(language: string): SqlDialectName {
  const key = language.toLowerCase();
  return Object.hasOwn(SQL_DIALECTS, key)
    ? SQL_DIALECTS[key as keyof typeof SQL_DIALECTS]
    : "PostgreSQL";
}

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

  sql: async (schema, language = "sql") => {
    const langSql = await import("@codemirror/lang-sql");
    const dialect = langSql[sqlDialectFor(language)];
    if (schema?.tables) {
      return [langSql.sql({ dialect, schema: toSqlSchema(schema) })];
    }
    return [langSql.sql({ dialect })];
  },

  // Connector-type aliases — so connection.type can be passed directly
  neo4j: async (schema) => languageResolvers.cypher(schema),
  postgresql: async (schema) => languageResolvers.sql(schema, "postgresql"),
  // Other SQL dialects a registry-supplied connector may declare (#1696).
  mysql: async (schema) => languageResolvers.sql(schema, "mysql"),
  mariadb: async (schema) => languageResolvers.sql(schema, "mariadb"),
  sqlite: async (schema) => languageResolvers.sql(schema, "sqlite"),
  mssql: async (schema) => languageResolvers.sql(schema, "mssql"),
  plsql: async (schema) => languageResolvers.sql(schema, "plsql"),
  cassandra: async (schema) => languageResolvers.sql(schema, "cassandra"),
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
  return languageResolvers[key](schema, key);
}
