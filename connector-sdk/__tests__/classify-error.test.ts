import {
  createErrorClassifier,
  mergeSignals,
  MALFORMED_URI_SIGNALS,
  PERMANENT_FAILURE_SIGNALS,
  TRANSIENT_FAILURE_SIGNALS,
  UNREACHABLE_HOST_SIGNALS,
} from "../src/generalized/classify-error";
import {
  ConnectorErrorType,
  type ConnectorConstraintKind,
} from "../src/generalized/ConnectorError";

const {
  AUTHENTICATION,
  BAD_URI,
  CONSTRAINT,
  NETWORK,
  QUERY,
  TIMEOUT,
  UNKNOWN,
} = ConnectorErrorType;

/** A made-up driver, so nothing here depends on a real one. */
const classify = createErrorClassifier({
  types: [
    { codes: ["E_AUTH"], type: AUTHENTICATION },
    { codePrefixes: ["STMT."], type: QUERY },
    { ...MALFORMED_URI_SIGNALS, type: BAD_URI },
    { ...UNREACHABLE_HOST_SIGNALS, type: NETWORK },
    { phrases: ["deadline"], patterns: [/took \d+ms/], type: TIMEOUT },
  ],
  permanent: mergeSignals(PERMANENT_FAILURE_SIGNALS, {
    codePrefixes: ["STMT."],
    phrases: ["bad statement"],
  }),
  transient: mergeSignals(TRANSIENT_FAILURE_SIGNALS, { codes: ["E_BUSY"] }),
  constraints: new Map<string, ConnectorConstraintKind>([["E_DUP", "unique"]]),
  blockedWrite: { phrases: ["read-only mode"] },
});

describe("createErrorClassifier", () => {
  it("names the type of the first rule that matches", () => {
    expect(classify({ code: "E_AUTH", message: "deadline" }).type).toBe(
      AUTHENTICATION,
    );
    expect(classify(new Error("Deadline exceeded")).type).toBe(TIMEOUT);
    expect(classify(new Error("it took 300ms")).type).toBe(TIMEOUT);
  });

  it("falls back to QUERY for an error nothing recognises", () => {
    expect(classify(new Error("column x is unknown"))).toEqual({
      type: QUERY,
      transient: false,
    });
  });

  it.each([null, undefined, "deadline", 42])(
    "is UNKNOWN and not transient for the non-object %p",
    (thrown) => {
      expect(classify(thrown)).toEqual({ type: UNKNOWN, transient: false });
    },
  );

  it("matches codes exactly and phrases whatever their case", () => {
    expect(classify({ code: "e_auth", message: "" }).type).toBe(QUERY);
    expect(classify(new Error("CONNECT ECONNREFUSED 10.0.0.1")).type).toBe(
      NETWORK,
    );
  });

  it("matches a code by prefix", () => {
    expect(classify({ code: "STMT.Syntax", message: "deadline" })).toEqual({
      type: QUERY,
      transient: false,
    });
  });

  it("never matches an error without a code against a code list", () => {
    const loose = createErrorClassifier({
      types: [{ codePrefixes: [""], type: TIMEOUT }],
      permanent: {},
      transient: {},
    });
    expect(loose(new Error("no code")).type).toBe(QUERY);
  });

  describe("transient", () => {
    it.each([
      ["a transient code", { code: "E_BUSY", message: "later" }],
      ["a socket code", { code: "ECONNRESET", message: "driver crashed" }],
      ["a transient phrase", new Error("Query timed out")],
    ])("is true for %s", (_label, err) => {
      expect(classify(err).transient).toBe(true);
    });

    it.each([
      ["a permanent phrase", new Error("bad statement near timeout")],
      ["a permanent code", { code: "ECONNREFUSED", message: "timeout" }],
      // #1898: `$param_timeout` missing — the statement's fault, not a timeout.
      [
        "a permanent code prefix",
        { code: "STMT.ParameterMissing", message: "Expected param_timeout" },
      ],
    ])("permanent beats transient: %s", (_label, err) => {
      expect(classify(err).transient).toBe(false);
    });
  });

  it("reports the broken schema rule as CONSTRAINT, by the driver's code", () => {
    expect(classify({ code: "E_DUP", message: "deadline" })).toEqual({
      type: CONSTRAINT,
      transient: false,
      constraint: { kind: "unique" },
    });
  });

  it("does not mistake an inherited property for a constraint code", () => {
    expect(classify({ code: "constructor", message: "" }).constraint).toBe(
      undefined,
    );
  });

  it("flags a write stopped by read-only execution", () => {
    expect(classify(new Error("Read-only mode")).blockedWrite).toBe(true);
    expect(classify(new Error("anything else")).blockedWrite).toBe(undefined);
  });
});

describe("shared signals", () => {
  const shared = createErrorClassifier({
    types: [
      { ...MALFORMED_URI_SIGNALS, type: BAD_URI },
      { ...UNREACHABLE_HOST_SIGNALS, type: NETWORK },
    ],
    permanent: PERMANENT_FAILURE_SIGNALS,
    transient: TRANSIENT_FAILURE_SIGNALS,
  });

  it.each([
    "Invalid URI scheme: 'http'",
    "Could not parse URI",
    "Unknown scheme: x+s",
    "Invalid connection URI: missing host",
    "URI malformed",
    "Invalid URL",
  ])("reads %j as BAD_URI", (message) => {
    expect(shared(new Error(message)).type).toBe(BAD_URI);
  });

  it.each([
    "connect ECONNREFUSED 127.0.0.1:1",
    "getaddrinfo ENOTFOUND db.example.com",
    "connect ETIMEDOUT",
    "connect EHOSTUNREACH 10.0.0.1",
    "Network is unreachable",
    "Connection refused",
    "Host is down",
  ])("reads %j as NETWORK", (message) => {
    expect(shared(new Error(message)).type).toBe(NETWORK);
  });

  it.each([
    "connect ETIMEDOUT 10.0.0.1:1",
    "read ECONNRESET",
    "write EPIPE: broken pipe",
    "socket hang up",
    "Connection reset by peer",
    "Query timeout exceeded",
  ])("reads %j as transient", (message) => {
    expect(shared(new Error(message)).transient).toBe(true);
  });

  it.each([
    "connect ECONNREFUSED 127.0.0.1:1",
    "getaddrinfo ENOTFOUND db.example.com",
    "Cannot read properties of undefined (reading 'timeout')",
    "Cannot find module 'timeout'",
  ])("reads %j as permanent", (message) => {
    expect(shared(new Error(message)).transient).toBe(false);
  });

  it.each(["ETIMEDOUT", "ECONNRESET", "EPIPE", "ESOCKETTIMEDOUT"])(
    "reads the socket code %s as transient",
    (code) => {
      expect(shared({ code, message: "x" }).transient).toBe(true);
    },
  );

  it.each(["ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH"])(
    "reads the socket code %s as permanent, whatever the message says",
    (code) => {
      expect(shared({ code, message: "timeout" }).transient).toBe(false);
    },
  );
});

describe("mergeSignals", () => {
  it("concatenates every kind of signal", () => {
    expect(
      mergeSignals(
        { codes: ["A"], phrases: ["one"] },
        { codes: ["B"], codePrefixes: ["P."], patterns: [/x/] },
      ),
    ).toEqual({
      codes: ["A", "B"],
      codePrefixes: ["P."],
      phrases: ["one"],
      patterns: [/x/],
    });
  });
});
