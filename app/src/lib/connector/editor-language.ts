import { CONNECTOR_QUERY_LANGUAGES } from "@neoboard/connection/query-languages";

/**
 * The CodeMirror editor language for a connector type (#1120). Driven by the
 * connector's declared `queryLanguage`; returns "" (plain text, no
 * highlighting) when the type is unknown or absent, so registry-supplied
 * connectors without a known language get a neutral editor.
 */
export function editorLanguageForConnector(type?: string): string {
  return CONNECTOR_QUERY_LANGUAGES[type ?? ""] ?? "";
}
