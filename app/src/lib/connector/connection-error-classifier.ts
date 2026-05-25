/**
 * Classify connector "test connection" failures into a small set of error
 * codes the UI can show targeted hints for.
 *
 * Goal: when a first-time user adds a connection and it fails, the message
 * should at least point at *which* knob to turn — credentials, network, or
 * the connection URI itself — without exposing raw driver internals.
 *
 * Keep classification keyword-based and conservative. When we're unsure,
 * return "unknown" rather than guessing — the UI falls back to the sanitized
 * raw message in that case.
 */

export type ConnectionErrorCode =
  | "auth_failed"
  | "network"
  | "bad_uri"
  | "unknown";

// Keyword lists are lowercased; the matcher lowercases input once.
const BAD_URI_KEYWORDS = [
  "invalid uri",
  "invalid connection uri",
  "invalid url",
  "could not parse uri",
  "could not parse url",
  "uri malformed",
  "url malformed",
  "invalid uri scheme",
  "unknown scheme",
];

const AUTH_KEYWORDS = [
  "authentication failure",
  "authentication failed",
  "authenticationratelimit",
  "password authentication failed",
  "invalid credentials",
  "unauthorized",
];

const NETWORK_KEYWORDS = [
  "econnrefused",
  "enotfound",
  "etimedout",
  "ehostunreach",
  "network is unreachable",
  "servicunavailable",
  "serviceunavailable",
  "could not perform discovery",
  "no routing servers available",
  "websocket connection failure",
  "connection refused",
  "host is down",
];

function containsAny(text: string, keywords: string[]): boolean {
  return keywords.some((k) => text.includes(k));
}

/**
 * Classify a raw error message from a connector test attempt.
 * Priority order: bad_uri > auth_failed > network > unknown.
 *
 * Why bad_uri first: a malformed URI often surfaces with a follow-on network
 * error (ETIMEDOUT trying to reach an unparseable host), but the fix is to
 * correct the URI, not the network.
 *
 * Why auth above network: failed auth attempts can be reported on top of
 * transient network warnings; the user's first step is to fix credentials.
 */
export function classifyConnectionError(message: string): ConnectionErrorCode {
  if (!message) return "unknown";
  const m = message.toLowerCase();

  if (containsAny(m, BAD_URI_KEYWORDS)) return "bad_uri";
  if (containsAny(m, AUTH_KEYWORDS)) return "auth_failed";
  if (containsAny(m, NETWORK_KEYWORDS)) return "network";
  return "unknown";
}

const HINTS: Record<ConnectionErrorCode, string> = {
  auth_failed:
    "Check the username and password — the server reported invalid credentials. For Neo4j the default user is `neo4j`; for PostgreSQL it matches your DB role.",
  network:
    "The server is unreachable. Verify the host and port, confirm the database is running, and check that no firewall is blocking the connection.",
  bad_uri:
    "The connection URI looks malformed. Confirm the scheme (e.g. `bolt://` or `neo4j+s://` for Neo4j, `postgresql://` for PostgreSQL) and that the host/port are present.",
  unknown:
    "Connection test failed for an unrecognised reason. Check the server logs for more detail.",
};

/**
 * User-facing hint for an error code. Stable copy, free of driver internals,
 * safe to render directly in the connection dialog.
 */
export function hintForConnectionErrorCode(code: ConnectionErrorCode): string {
  return HINTS[code];
}
