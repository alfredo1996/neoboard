import type { ConnectorDescriptor } from "@neoboard/connection";

/**
 * The CodeMirror editor language for a connector type (#1120): whatever
 * `queryLanguage` its descriptor declares. `connectors` is the list from
 * `useConnectors()` (#1899). Returns "" — plain text, no highlighting — for a
 * connector that declares none or is not installed, and while the list loads.
 */
export function editorLanguageForConnector(
  connectors:
    readonly Pick<ConnectorDescriptor, "type" | "queryLanguage">[] | undefined,
  type?: string | null,
): string {
  return connectors?.find((c) => c.type === type)?.queryLanguage ?? "";
}

/**
 * A term's key as the editor's language wants it written (#1693): quoted only
 * when it is not a plain identifier. Decided by the language, never the
 * connector. An unknown language gets the bare key.
 */
export function quoteTerm(name: string, language: string): string {
  if (language === "cypher") {
    return /^[A-Za-z_]\w*$/.test(name)
      ? name
      : "`" + name.replaceAll("`", "``") + "`";
  }
  if (language === "sql") {
    return /^[a-z_][a-z0-9_]*$/.test(name)
      ? name
      : '"' + name.replaceAll('"', '""') + '"';
  }
  return name;
}
