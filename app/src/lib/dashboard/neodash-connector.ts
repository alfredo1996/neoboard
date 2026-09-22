import type { ConnectorDescriptor } from "@neoboard/connection";

/** All this needs of a connector: what it is called, and what it speaks. */
type Candidate = Pick<ConnectorDescriptor, "type" | "label" | "queryLanguage">;

/**
 * The installed connector a NeoDash dashboard can be imported onto (#1900).
 *
 * A NeoDash dashboard's reports are Cypher, so the question is which installed
 * connector SPEAKS Cypher — a question about the query language, which the
 * descriptor declares, and not about a connector's name. The import used to
 * synthesize a hardcoded connector type and assume it was installed.
 *
 * `undefined` means either that the connectors have not loaded yet or that
 * nothing installed can run these queries; the caller distinguishes the two.
 */
export function cypherConnector<T extends Candidate>(
  connectors: readonly T[] | undefined,
): T | undefined {
  return connectors?.find((c) => c.queryLanguage === "cypher");
}
