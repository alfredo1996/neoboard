import type { ConnectorDescriptor } from "@neoboard/connection";

/**
 * What to call a connection's connector in the UI: the label its descriptor
 * declares (#1905), read off the list `useConnectors()` returns.
 *
 * Falls back to the raw type when there is no descriptor to ask — the
 * connector is uninstalled, or the list has not loaded — because a blank reads
 * as a missing value. Empty only when there is no type at all, which a widget
 * template that needs no connection legitimately has (#1900).
 *
 * The sibling of `editorLanguageForConnector`, and the type is imported
 * type-only for the same reason: this runs in the browser, where the
 * connection barrel's drivers cannot be bundled.
 */
export function connectorLabel(
  connectors:
    readonly Pick<ConnectorDescriptor, "type" | "label">[] | undefined,
  type?: string | null,
): string {
  if (!type) return "";
  return connectors?.find((c) => c.type === type)?.label ?? type;
}
