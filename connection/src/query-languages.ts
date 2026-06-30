/**
 * Built-in connector query languages — the single, client-safe source of
 * truth for which CodeMirror language the query editor uses (#1120).
 *
 * Imports NO database drivers, so the browser bundle can pull it via
 * `@neoboard/connection/query-languages` without dragging neo4j-driver / pg
 * in. The plugins re-export these as their `queryLanguage`, so the data
 * lives in exactly one place.
 *
 * Values are the lowercase CodeMirror language keys the editor's resolver
 * registry understands ("cypher", "sql"). A connector type absent from this
 * map (or mapping to an unregistered language) gets a plain-text editor.
 */

export const CONNECTOR_QUERY_LANGUAGES: Record<string, string> = {
  neo4j: "cypher",
  postgresql: "sql",
};
