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
  /** A loopback host, unreachable because we are inside a container (#1346). */
  | "container_loopback"
  | "unknown";

/** What the classifier needs beyond the message to spot a Docker networking miss. */
export interface ConnectionErrorContext {
  /** The URI the user entered. */
  uri?: string;
  /** Whether the app itself is running inside a container. */
  containerised?: boolean;
}

/**
 * Is this URI pointed at the machine it is running on?
 *
 * Parsed, not substring-matched: "myhost-localhost.example.com" contains
 * "localhost" and is not loopback. Returns false for anything unparseable —
 * this runs on an error path, where a throw would replace a bad message with
 * a 500, and a malformed URI is already better served by `bad_uri`.
 */
function isLoopbackUri(uri: string | undefined): boolean {
  if (!uri) return false;
  let host: string;
  try {
    host = new URL(uri).hostname.toLowerCase();
  } catch {
    return false;
  }
  // URL strips the brackets from [::1]; both forms normalise to "::1".
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "[::1]" ||
    host.endsWith(".localhost")
  );
}

/**
 * Shown when a connector's check returns false *without* throwing — there's no
 * driver message to classify, so the old "Connection check returned false" was
 * a dead end. This points at the knobs to check instead (#1043).
 */
export const CONNECTION_CHECK_FALSE_MESSAGE =
  "The database rejected the connection check without reporting why. Verify the host, port, credentials, and that the database is running and reachable.";

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
export function classifyConnectionError(
  message: string,
  context?: ConnectionErrorContext,
): ConnectionErrorCode {
  if (!message) return "unknown";
  const m = message.toLowerCase();

  if (containsAny(m, BAD_URI_KEYWORDS)) return "bad_uri";
  if (containsAny(m, AUTH_KEYWORDS)) return "auth_failed";
  if (containsAny(m, NETWORK_KEYWORDS)) {
    // Narrowing a network failure, never overriding auth or bad_uri: a
    // loopback auth failure is still an auth failure, and pointing at Docker
    // there would be a misdiagnosis.
    //
    // The containerised check is what keeps this honest. In local mode the app
    // runs on the host, where localhost is exactly right — that user must not
    // be sent to a Docker hostname that does not exist for them.
    return context?.containerised && isLoopbackUri(context.uri)
      ? "container_loopback"
      : "network";
  }
  return "unknown";
}

const HINTS: Record<ConnectionErrorCode, string> = {
  auth_failed:
    "Check the username and password — the server reported invalid credentials. For Neo4j the default user is `neo4j`; for PostgreSQL it matches your DB role.",
  network:
    "The server is unreachable. Verify the host and port, confirm the database is running, and check that no firewall is blocking the connection.",
  bad_uri:
    "The connection URI looks malformed. Confirm the scheme (e.g. `bolt://` or `neo4j+s://` for Neo4j, `postgresql://` for PostgreSQL) and that the host/port are present.",
  container_loopback:
    "NeoBoard is running inside a container, so `localhost` means the container itself — not your machine. To reach a database running on your host, use `host.docker.internal` instead of `localhost` (e.g. `neo4j://host.docker.internal:7687`). A database in the same Docker network can be reached by its service name.",
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
