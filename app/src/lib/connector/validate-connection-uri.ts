import type { ConnectorType } from "@/lib/connector/connector-types";

/**
 * Client-side URI *format* validation for the connection dialog (#1043).
 *
 * Saving an unreachable connection is intentional, but a malformed URI like
 * `not-a-uri` should be caught before save instead of persisting as an
 * Error-badge connection. This checks shape only (parseable, expected scheme,
 * has a host) — it never attempts a network connection.
 *
 * Returns null when the URI is well-formed, otherwise an actionable message.
 */
const SCHEMES: Record<ConnectorType, string[]> = {
  neo4j: ["bolt:", "bolt+s:", "bolt+ssc:", "neo4j:", "neo4j+s:", "neo4j+ssc:"],
  postgresql: ["postgres:", "postgresql:"],
};

export function validateConnectionUri(
  uri: string,
  type: ConnectorType,
): string | null {
  const trimmed = uri.trim();
  if (!trimmed) return "URI is required.";

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return type === "neo4j"
      ? "Enter a valid URI, e.g. bolt://localhost:7687 or neo4j+s://host."
      : "Enter a valid URI, e.g. postgresql://localhost:5432/db.";
  }

  if (!parsed.hostname) {
    return "The URI is missing a host.";
  }

  // A password in the URI is silently ignored — the connectors read host, port
  // and database off the URL and take auth from the separate fields. So it does
  // nothing except sit in a `type: "text"` input, in the in-memory module cache
  // key, and in any error that quotes the URI. Rejected at the write boundary
  // rather than in the module constructor, which also runs for already-stored
  // connections and would break them (#1303).
  //
  // A bare username (`postgres://user@host/db`) is deliberately still accepted:
  // it is a standard documented form and is not a secret. It is ignored too,
  // but nothing leaks by ignoring it.
  if (parsed.password) {
    return "Do not put a password in the URI — use the password field.";
  }

  const allowed = SCHEMES[type];
  if (allowed && !allowed.includes(parsed.protocol)) {
    return `Unexpected scheme "${parsed.protocol.replace(
      ":",
      "",
    )}". Use one of: ${allowed.map((s) => s.replace(":", "")).join(", ")}.`;
  }

  return null;
}
