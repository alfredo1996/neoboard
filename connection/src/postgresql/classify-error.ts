/**
 * What a PostgreSQL error IS (#1903) — the one place SQLSTATEs and node-pg's
 * phrases are read. These tables lived in the app until then, which meant the
 * app knew which connector it was talking to.
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
  type ConnectorErrorClassification,
  type ErrorSignals,
} from "@neoboard/connector-sdk";

const {
  AUTHENTICATION,
  BAD_URI,
  CONNECTION,
  NETWORK,
  QUERY,
  READ_ONLY_VIOLATION,
  TIMEOUT,
} = ConnectorErrorType;

/**
 * invalid_password, invalid_authorization_specification, and the GSSAPI
 * invalid_password. NOT 3D000 (invalid_catalog_name): credentials can be fine
 * while the database does not exist, so that one is a CONNECTION error (#974).
 */
export const AUTHENTICATION_SQLSTATES = ["28P01", "28000", "28001"];

const AUTHENTICATION_PHRASES: ErrorSignals = {
  phrases: ["authentication failed"],
};

/**
 * Classes 22 (data exception), 23 (integrity constraint violation) and 42
 * (syntax error or access rule violation): the statement's own fault, whatever
 * its message says — `column "timeout" does not exist` is not a timeout.
 */
const STATEMENT_SQLSTATES: ErrorSignals = { codePrefixes: ["22", "23", "42"] };

/** The same, for a message that arrives without its SQLSTATE. */
const STATEMENT_PHRASES: ErrorSignals = {
  phrases: [
    "syntax error",
    "does not exist",
    "permission denied",
    "invalid input",
    "expected parameter",
  ],
};

const classify = createErrorClassifier({
  types: [
    // SQLSTATE first: it is authoritative.
    { codes: ["25006"], type: READ_ONLY_VIOLATION }, // read_only_sql_transaction
    { codes: AUTHENTICATION_SQLSTATES, type: AUTHENTICATION },
    { codes: ["57014", "57P01"], type: TIMEOUT }, // query_canceled, admin_shutdown
    { codes: ["3D000", "08001", "08003", "08006"], type: CONNECTION },
    { ...STATEMENT_SQLSTATES, type: QUERY },
    // No SQLSTATE: pg-pool, the socket, or a message on its own. A bad URI is
    // read before a network failure because it usually causes one; bad
    // credentials before it because they are the first thing to fix.
    { ...MALFORMED_URI_SIGNALS, type: BAD_URI },
    { ...AUTHENTICATION_PHRASES, type: AUTHENTICATION },
    {
      ...mergeSignals(UNREACHABLE_HOST_SIGNALS, {
        // What node-pg says about a host that drops packets. None carries a
        // network code, and all say "timeout" — which is not a query timeout
        // (#1678).
        phrases: [
          "connection terminated due to connection timeout", // pg-pool ≥3.14 wrapping the client's connect timeout
          "timeout exceeded when trying to connect", // pg-pool: every client busy
          "timeout expired", // pg.Client connectionTimeoutMillis, no pool
        ],
      }),
      type: NETWORK,
    },
    { ...STATEMENT_PHRASES, type: QUERY },
    { phrases: ["timeout", "canceling statement"], type: TIMEOUT },
    { phrases: ["connect"], type: CONNECTION },
  ],
  permanent: mergeSignals(
    PERMANENT_FAILURE_SIGNALS,
    STATEMENT_SQLSTATES,
    STATEMENT_PHRASES,
    AUTHENTICATION_PHRASES,
  ),
  transient: mergeSignals(TRANSIENT_FAILURE_SIGNALS, {
    codes: ["57014"],
    // A backend that died mid-query; the next checkout gets a live one.
    phrases: ["connection terminated", "server closed the connection"],
  }),
  constraints: new Map<string, ConnectorConstraintKind>([
    ["23502", "not_null"],
    ["23505", "unique"],
    ["23503", "foreign_key"],
    ["23514", "check"],
    ["23P01", "exclusion"],
    ["22P02", "invalid_format"], // invalid_text_representation
    ["22003", "out_of_range"], // numeric_value_out_of_range
    ["22001", "too_long"], // string_data_right_truncation
    ["22007", "invalid_datetime"], // invalid_datetime_format
    ["22008", "invalid_datetime"], // datetime_field_overflow
  ]),
  blockedWrite: {
    codes: ["25006"],
    phrases: [
      "read-only transaction",
      "read only transaction",
      "cannot execute",
    ],
    // No syntax signature (#1932). "syntax error at or near <write keyword>"
    // meant a blocked write only while the preview wrapped the query in a
    // SELECT (#1043); #1896 removed the wrapper, so a real write fails as
    // 25006 above and every remaining match was a genuine syntax error.
  },
});

const named = (value: unknown) =>
  typeof value === "string" ? value : undefined;

/**
 * The tables, plus the two NAMES node-pg reports for a broken constraint. They
 * describe the schema being written to. The driver's `detail` — the failing
 * row — and its message are never read.
 */
export function classifyPostgresError(
  err: unknown,
): ConnectorErrorClassification {
  const classification = classify(err);
  if (!classification.constraint) return classification;
  const { column, constraint } = err as {
    column?: unknown;
    constraint?: unknown;
  };
  return {
    ...classification,
    constraint: {
      ...classification.constraint,
      column: named(column),
      name: named(constraint),
    },
  };
}
