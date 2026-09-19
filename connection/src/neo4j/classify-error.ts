/**
 * What a Neo4j error IS (#1903) — the one place the server's codes and the
 * driver's phrases are read. These lists lived in the app until then, which
 * meant the app knew which connector it was talking to.
 */

import {
  ConnectorErrorType,
  createErrorClassifier,
  mergeSignals,
  MALFORMED_URI_SIGNALS,
  PERMANENT_FAILURE_SIGNALS,
  TRANSIENT_FAILURE_SIGNALS,
  UNREACHABLE_HOST_SIGNALS,
  type ConnectorConstraintKind,
  type ErrorSignals,
} from "@neoboard/connector-sdk";

const { AUTHENTICATION, BAD_URI, CONNECTION, NETWORK, QUERY, TIMEOUT } =
  ConnectorErrorType;

/**
 * A statement the server rejected. That is the statement's own fault whatever
 * its message says: a missing `$param_timeout` is not a timeout (#1898).
 */
const STATEMENT_FAULT: ErrorSignals = {
  codePrefixes: ["Neo.ClientError.Statement."],
};

export const classifyNeo4jError = createErrorClassifier({
  types: [
    // The server's codes first: they are authoritative.
    {
      codes: [
        "Neo.ClientError.Security.Unauthorized",
        "Neo.ClientError.Security.AuthenticationRateLimit",
      ],
      type: AUTHENTICATION,
    },
    {
      codes: [
        "Neo.ClientError.Transaction.TransactionTimedOut",
        "Neo.ClientError.Transaction.TransactionTimedOutClientConfiguration",
      ],
      type: TIMEOUT,
    },
    { ...STATEMENT_FAULT, type: QUERY },
    // No server code: the driver, the socket, or a message on its own. A bad
    // URI is read before a network failure because it usually causes one; bad
    // credentials before it because they are the first thing to fix.
    { ...MALFORMED_URI_SIGNALS, type: BAD_URI },
    {
      phrases: ["authentication", "unauthorized", "invalid credentials"],
      type: AUTHENTICATION,
    },
    {
      ...mergeSignals(UNREACHABLE_HOST_SIGNALS, {
        phrases: [
          "serviceunavailable",
          // Routing discovery found no server to talk to.
          "could not perform discovery",
          "no routing servers available",
          "websocket connection failure",
          // The channel: "Failed to connect to server…", and on
          // connectionTimeout "Failed to establish connection in 30000ms" —
          // neither names a network code (#1678).
          "failed to connect",
          "failed to establish connection",
        ],
      }),
      type: NETWORK,
    },
    {
      phrases: [
        "the transaction has been terminated",
        "transaction timeout",
        "has been terminated. retry",
      ],
      type: TIMEOUT,
    },
    // After NETWORK on purpose: the driver also says ServiceUnavailable for a
    // connection that dropped mid-query, and that host is not unreachable.
    { codes: ["ServiceUnavailable"], type: CONNECTION },
  ],
  permanent: mergeSignals(PERMANENT_FAILURE_SIGNALS, STATEMENT_FAULT, {
    // Cypher syntax errors, for a message that arrives without its code.
    phrases: ["invalid input", "expected an identifier"],
  }),
  transient: mergeSignals(TRANSIENT_FAILURE_SIGNALS, {
    phrases: ["connection acquisition"],
  }),
  // One code covers unique, existence and key constraints alike.
  constraints: new Map<string, ConnectorConstraintKind>([
    ["Neo.ClientError.Schema.ConstraintValidationFailed", "other"],
  ]),
  blockedWrite: {
    phrases: [
      "writing in read access mode not allowed",
      "write operations are not allowed",
    ],
  },
});
