/**
 * What to tell a user whose connection failed (#1903).
 *
 * The app does not recognise any driver's errors. The connector that raised
 * the error classified it (`ConnectorPlugin.classifyError`) and the verdict
 * rides on the error; this module only maps that connector-neutral category to
 * a Test-result code and a hint — *which* knob to turn: credentials, network,
 * or the URI.
 */

import type {
  ConnectorDescriptor,
  ConnectorErrorClassification,
  ConnectorField,
} from "@neoboard/connection";

export type ConnectionErrorCode =
  | "auth_failed"
  | "network"
  | "bad_uri"
  /** A loopback host, unreachable because we are inside a container (#1346). */
  | "container_loopback"
  | "unknown";

/** What it takes, beyond the error, to spot a Docker networking miss. */
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
 * Shown when a connector's check returns false *without* throwing — there is
 * nothing to classify, so the old "Connection check returned false" was a dead
 * end. This points at the knobs to check instead (#1043).
 */
export const CONNECTION_CHECK_FALSE_MESSAGE =
  "The database rejected the connection check without reporting why. Verify the host, port, credentials, and that the database is running and reachable.";

/**
 * The verdict the connector attached to an error it raised, or `undefined`
 * for an error that did not come from a connector.
 *
 * Matched by name, not instanceof: app/ does not depend on the SDK, and
 * connection/ resolves its own copy of it anyway.
 *
 * The scope matters as much as the match. `handleRouteError` catches for
 * every route, including ones that only touch NeoBoard's own database — if
 * *that* refuses a connection, telling the user to check their connector's
 * host would be a misdiagnosis.
 */
export function classificationOf(
  error: unknown,
): ConnectorErrorClassification | undefined {
  if (!(error instanceof Error) || error.name !== "ConnectorError") {
    return undefined;
  }
  return (error as Error & { classification?: ConnectorErrorClassification })
    .classification;
}

/** Every category without an entry is `unknown`: the UI then shows the sanitized message alone. */
const CODE_BY_TYPE: Partial<
  Record<ConnectorErrorClassification["type"], ConnectionErrorCode>
> = {
  BAD_URI: "bad_uri",
  AUTHENTICATION: "auth_failed",
  NETWORK: "network",
};

/**
 * The Test-result code for an error a connector raised.
 *
 * `container_loopback` narrows a network failure and never overrides auth or
 * bad_uri: a loopback auth failure is still an auth failure, and pointing at
 * Docker there would be a misdiagnosis. It is decided here, not by the
 * connector, because it is a fact about the deployment.
 *
 * The containerised check is what keeps it honest. In local mode the app runs
 * on the host, where localhost is exactly right — that user must not be sent
 * to a Docker hostname that does not exist for them.
 */
export function connectionErrorCode(
  error: unknown,
  context?: ConnectionErrorContext,
): ConnectionErrorCode {
  const type = classificationOf(error)?.type;
  const code = (type && CODE_BY_TYPE[type]) ?? "unknown";
  return code === "network" &&
    context?.containerised &&
    isLoopbackUri(context.uri)
    ? "container_loopback"
    : code;
}

const HINTS: Record<ConnectionErrorCode, string> = {
  auth_failed:
    "Check the username and password — the server reported invalid credentials.",
  network:
    "The server is unreachable. Verify the host and port, confirm the database is running, and check that no firewall is blocking the connection.",
  bad_uri:
    "The connection URI looks malformed. Confirm the scheme and that the host/port are present.",
  container_loopback:
    "The connection is opened by the NeoBoard **server**, not by your browser — so `localhost` means the machine NeoBoard runs on, and right now that is the container it runs inside. If the database is on that same host, restart NeoBoard with `neoboard start --full --expose-host` and use `host.docker.internal` in place of `localhost`. A database in the same Docker network is reached by its service name. If the database is on **your own computer** and NeoBoard is deployed elsewhere, it is not reachable at all — the server cannot see your machine; expose it at a routable address first.",
  unknown:
    "Connection test failed for an unrecognised reason. Check the server logs for more detail.",
};

/**
 * Where an example helps, it is the connector's own: the placeholder of one of
 * its descriptor fields. The app has no example of its own to offer — it would
 * be an example of some connector it is not supposed to know.
 */
const EXAMPLES: Partial<
  Record<
    ConnectionErrorCode,
    { of: (field: ConnectorField) => boolean; say: (example: string) => string }
  >
> = {
  auth_failed: {
    of: (field) => field.key === "username",
    say: (example) => ` A typical username is \`${example}\`.`,
  },
  bad_uri: {
    of: (field) => field.type === "uri",
    say: (example) => ` For example: \`${example}\`.`,
  },
};

/**
 * User-facing hint for an error code. Stable copy, free of driver internals,
 * safe to render directly in the connection dialog. Pass the connector's
 * descriptor where one is at hand and the hint carries that connector's own
 * example.
 */
export function hintForConnectionErrorCode(
  code: ConnectionErrorCode,
  connector?: Pick<ConnectorDescriptor, "fields">,
): string {
  const example = EXAMPLES[code];
  const placeholder =
    example && connector?.fields.find(example.of)?.placeholder;
  return placeholder ? HINTS[code] + example.say(placeholder) : HINTS[code];
}

/**
 * Why a connector nobody can reach failed — unroutable host, refused port,
 * bad credentials — or `undefined` when this error is not that.
 *
 * Shared with the dead-connector middleware, so the memo and the 502 can
 * never disagree on what counts as unreachable (#1888).
 */
export function connectorUnavailableReason(
  error: unknown,
): Extract<ConnectionErrorCode, "network" | "auth_failed"> | undefined {
  const code = connectionErrorCode(error);
  return code === "network" || code === "auth_failed" ? code : undefined;
}
