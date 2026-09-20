import type { ConnectorField } from "@neoboard/connection";

/**
 * Client-side URI *format* validation for the connection dialog (#1043).
 *
 * Saving an unreachable connection is intentional, but a malformed URI like
 * `not-a-uri` should be caught before save instead of persisting as an
 * Error-badge connection. This checks shape only (parseable, expected scheme,
 * has a host) — it never attempts a network connection.
 *
 * `field` is the `uri` field of the connector's descriptor: the accepted
 * schemes and the example are the connector's own, so this file knows none
 * (#1903). Without it — the descriptors still loading — no scheme is checked;
 * the server's check is the authoritative one either way.
 *
 * Returns null when the URI is well-formed, otherwise an actionable message.
 */
export function validateConnectionUri(
  uri: string,
  field: Pick<ConnectorField, "protocols" | "placeholder"> | undefined,
): string | null {
  const trimmed = uri.trim();
  if (!trimmed) return "URI is required.";

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return field?.placeholder
      ? `Enter a valid URI, e.g. ${field.placeholder}.`
      : "Enter a valid URI.";
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
  // A bare username (`scheme://user@host/db`) is deliberately still accepted:
  // it is a standard documented form and is not a secret. It is ignored too,
  // but nothing leaks by ignoring it.
  if (parsed.password) {
    return "Do not put a password in the URI — use the password field.";
  }

  const allowed = field?.protocols ?? [];
  if (allowed.length > 0 && !allowed.includes(parsed.protocol)) {
    return `Unexpected scheme "${parsed.protocol.replace(
      ":",
      "",
    )}". Use one of: ${allowed.map((s) => s.replace(":", "")).join(", ")}.`;
  }

  return null;
}
