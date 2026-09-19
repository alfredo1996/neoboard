/**
 * Driver errors as the two built-in connectors really raise them (#1903).
 *
 * Every row comes from a test that used to feed it to an app-side keyword
 * classifier. They live on as OPAQUE input: the app never reads them, it hands
 * them to the connector named in `connector` and maps what comes back.
 */
export interface DriverErrorFixture {
  connector: string;
  message: string;
  code?: string;
  column?: string;
  constraint?: string;
  detail?: string;
}

const PG = "postgresql";
const NEO = "neo4j";

const both = (message: string, code?: string): DriverErrorFixture[] =>
  [PG, NEO].map((connector) => ({ connector, message, ...(code && { code }) }));

export const DRIVER_ERROR_FIXTURES: DriverErrorFixture[] = [
  // ── write errors (db-error-message) ──
  {
    connector: PG,
    code: "23502",
    column: "rating",
    detail: "Failing row contains (12, null, test, jpijpjp, 2026-07-03 ...).",
    message: 'null value in column "rating" of relation "feedback" ...',
  },
  { connector: PG, code: "23502", message: "null value" },
  { connector: PG, code: "23505", column: "c", message: "duplicate key" },
  { connector: PG, code: "23503", column: "c", message: "foreign key" },
  { connector: PG, code: "23514", column: "c", message: "check" },
  { connector: PG, code: "23514", constraint: "rating_range", message: "chk" },
  { connector: PG, code: "22P02", column: "c", message: "bad text" },
  { connector: PG, code: "22003", column: "c", message: "out of range" },
  { connector: PG, code: "22001", column: "c", message: "value too long" },
  { connector: PG, code: "22007", column: "c", message: "bad date" },
  { connector: PG, code: "22008", column: "c", message: "date overflow" },
  { connector: PG, code: "23P01", column: "c", message: "exclusion" },
  {
    connector: PG,
    code: "25006",
    message: "cannot execute INSERT in a read-only transaction",
  },
  {
    connector: NEO,
    code: "Neo.ClientError.Schema.ConstraintValidationFailed",
    message: "Node(1) already exists with label `Person` and property `id`",
  },
  { connector: PG, code: "42601", message: 'syntax error at or near "THIS"' },
  { connector: PG, code: "42P01", message: 'relation "x" does not exist' },
  { connector: PG, code: "42703", message: 'column "x" does not exist' },
  { connector: PG, code: "XX999", message: "internal" },
  { connector: PG, message: "boom" },

  // ── transient vs permanent (transient-error-classifier) ──
  { connector: PG, message: "connect ETIMEDOUT 10.0.0.1:5432" },
  { connector: PG, message: "canceling statement due to statement timeout" },
  { connector: NEO, message: "The transaction has been terminated. timed out" },
  ...both("Query timeout exceeded (5000ms)"),
  ...both("read ECONNRESET"),
  { connector: PG, message: "Connection terminated unexpectedly" },
  ...both("write EPIPE: broken pipe"),
  ...both("socket hang up"),
  { connector: NEO, message: "connection acquisition timeout" },
  { connector: PG, message: "server closed the connection unexpectedly" },
  ...both("network error", "ETIMEDOUT"),
  ...both("driver crashed", "ECONNRESET"),
  { connector: PG, message: 'syntax error at or near "FROM"' },
  { connector: PG, message: 'relation "users" does not exist' },
  { connector: PG, message: 'column "foo" does not exist' },
  { connector: PG, message: "permission denied for table users" },
  { connector: PG, message: "password authentication failed for user" },
  { connector: PG, message: "connect ECONNREFUSED 127.0.0.1:5432" },
  ...both("getaddrinfo ENOTFOUND db.example.com"),
  { connector: PG, message: "invalid input syntax for type integer" },
  { connector: NEO, message: "Invalid input '*': expected an identifier" },
  ...both("Cannot read properties of undefined"),
  ...both("nope", "ECONNREFUSED"),
  ...both("Connection TIMED OUT after 30s"),
  { connector: PG, message: "STATEMENT TIMEOUT exceeded" },
  { connector: PG, message: 'syntax error at "timeout" near line 3' },

  // ── connection test codes (connection-error-classifier) ──
  { connector: NEO, message: "authentication failure" },
  { connector: NEO, message: "AuthenticationRateLimit" },
  {
    connector: NEO,
    message: "The client is unauthorized due to authentication failure.",
  },
  {
    connector: PG,
    message: 'password authentication failed for user "neo4j"',
  },
  { connector: NEO, message: "Unauthorized: invalid credentials" },
  { connector: NEO, message: "connect ECONNREFUSED 127.0.0.1:7687" },
  { connector: NEO, message: "connect ETIMEDOUT" },
  {
    connector: NEO,
    message:
      "ServiceUnavailable: Could not perform discovery. No routing servers available.",
  },
  { connector: NEO, message: "WebSocket connection failure" },
  ...both("Network is unreachable"),
  { connector: PG, message: "Connection terminated due to connection timeout" },
  { connector: PG, message: "timeout exceeded when trying to connect" },
  { connector: PG, message: "timeout expired" },
  {
    connector: NEO,
    message:
      "Failed to connect to server. Please ensure that your database is listening on the correct host and port and that you have compatible encryption settings both on Neo4j server and driver. Note that the default encryption setting has changed in Neo4j 4.0. Caused by: Failed to establish connection in 30000ms",
  },
  { connector: NEO, message: "Failed to establish connection in 30000ms" },
  {
    connector: NEO,
    message:
      "The transaction has been terminated. Retry your operation in a new transaction, and you should see a successful result. The transaction has not completed within the specified timeout (dbms.transaction.timeout).",
  },
  {
    connector: NEO,
    message:
      "Connection acquisition timed out in 60000 ms. Pool status: Active conn count = 100, Idle conn count = 0.",
  },
  ...both("Invalid URI scheme: 'http'"),
  ...both("Could not parse URI"),
  ...both("Unknown scheme: postgres+s"),
  ...both("Invalid connection URI: missing host"),
  ...both("URI malformed"),
  ...both("Something completely unrecognized happened"),
  {
    connector: NEO,
    message:
      "authentication failure: ECONNREFUSED while reading server greeting",
  },
  ...both("Invalid URI scheme: 'http' (ETIMEDOUT trying to connect)"),

  // ── blocked writes (preview-error) ──
  { connector: PG, message: 'syntax error at or near "DELETE"' },
  { connector: PG, message: 'syntax error at or near "UPDATE"' },
  { connector: PG, message: 'syntax error at or near "INSERT"' },
  {
    connector: NEO,
    message:
      "Neo.ClientError.Request.Invalid: Writing in read access mode not allowed.",
  },
  {
    connector: PG,
    message: "cannot execute DELETE in a read-only transaction",
  },
  { connector: PG, message: 'syntax error at or near "FROMM"' },
];

/** The fixture as the driver throws it: an Error carrying the driver's own fields. */
export function driverError(fixture: DriverErrorFixture): Error {
  const { connector: _connector, message, ...fields } = fixture;
  return Object.assign(new Error(message), fields);
}
