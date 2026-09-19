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
