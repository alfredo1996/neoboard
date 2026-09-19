/**
 * Built-in connector query languages, in the shape the query editor reads
 * today (#1120). Since #1897 this is a projection of each connector's
 * descriptor (`queryLanguage`), so the data lives in exactly one place. #1899
 * deletes this file once the editor reads descriptors from GET /api/connectors.
 *
 * Imports NO database drivers (the descriptors are pure data), so the browser
 * bundle can pull it via `@neoboard/connection/query-languages`.
 *
 * Values are the lowercase CodeMirror language keys the editor's resolver
 * registry understands ("cypher", "sql"). A connector type absent from this
 * map (or mapping to an unregistered language) gets a plain-text editor.
 */

import { neo4jDescriptor } from "./neo4j/descriptor";
import { postgresDescriptor } from "./postgresql/descriptor";

export const CONNECTOR_QUERY_LANGUAGES: Record<string, string> =
  Object.fromEntries(
    [neo4jDescriptor, postgresDescriptor].flatMap(({ type, queryLanguage }) =>
      queryLanguage ? [[type, queryLanguage]] : [],
    ),
  );
