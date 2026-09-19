import {
  ConnectorError,
  ConnectorErrorType,
  defaultClassifyError,
  wrapError,
  type ConnectorErrorClassification,
} from "../src/generalized/ConnectorError";

describe("ConnectorError", () => {
  it("creates an error with type and original", () => {
    const original = new Error("timeout");
    const err = new ConnectorError(
      "query timed out",
      ConnectorErrorType.TIMEOUT,
      original,
    );
    expect(err.message).toBe("query timed out");
    expect(err.type).toBe(ConnectorErrorType.TIMEOUT);
    expect(err.originalError).toBe(original);
    expect(err.name).toBe("ConnectorError");
    expect(err instanceof Error).toBe(true);
  });

  it("defaults to UNKNOWN type", () => {
    const err = new ConnectorError("something");
    expect(err.type).toBe(ConnectorErrorType.UNKNOWN);
    expect(err.classification).toEqual({
      type: ConnectorErrorType.UNKNOWN,
      transient: false,
    });
  });

  it("carries a full classification, and its type mirrors it", () => {
    const classification: ConnectorErrorClassification = {
      type: ConnectorErrorType.CONSTRAINT,
      transient: false,
      constraint: { kind: "not_null", column: "rating" },
    };
    const err = new ConnectorError("rejected", classification);
    expect(err.classification).toBe(classification);
    expect(err.type).toBe(ConnectorErrorType.CONSTRAINT);
  });

  it.each([
    [ConnectorErrorType.TIMEOUT, true],
    [ConnectorErrorType.QUERY, false],
    [ConnectorErrorType.AUTHENTICATION, false],
    [ConnectorErrorType.NETWORK, false],
    [ConnectorErrorType.BAD_URI, false],
  ])("a bare %s type is transient: %s", (type, transient) => {
    expect(new ConnectorError("x", type).classification).toEqual({
      type,
      transient,
    });
  });

  it("serialises to its classification only — never the driver's error or message", () => {
    const driverError = Object.assign(new Error("duplicate key"), {
      detail: "Failing row contains (12, hunter2)",
      uri: "postgresql://admin:s3cret@db.internal:5432/app",
    });
    const err = new ConnectorError(
      'null value in column "rating" — INSERT INTO t VALUES ($1) [hunter2]',
      ConnectorErrorType.QUERY,
      driverError,
    );
    const json = JSON.stringify(err);
    expect(JSON.parse(json)).toEqual({
      name: "ConnectorError",
      type: "QUERY",
      classification: { type: "QUERY", transient: false },
    });
    expect(json).not.toMatch(/hunter2|s3cret|db\.internal|INSERT/);
  });
});

describe("defaultClassifyError", () => {
  it("honours what a ConnectorError already says", () => {
    const classification: ConnectorErrorClassification = {
      type: ConnectorErrorType.NETWORK,
      transient: false,
    };
    expect(defaultClassifyError(new ConnectorError("x", classification))).toBe(
      classification,
    );
  });

  it("honours a ConnectorError from another copy of this package, by name", () => {
    const classification = {
      type: ConnectorErrorType.TIMEOUT,
      transient: true,
    };
    const foreign = Object.assign(new Error("x"), {
      name: "ConnectorError",
      classification,
    });
    expect(defaultClassifyError(foreign)).toBe(classification);
  });

  it.each([
    [
      "an Error whose message is full of keywords",
      new Error("timeout ECONNREFUSED authentication failed"),
    ],
    [
      "an error with a driver code",
      Object.assign(new Error("x"), { code: "57014" }),
    ],
    ["a string", "timeout"],
    ["null", null],
    ["undefined", undefined],
  ])("reads no message: %s is UNKNOWN and not transient", (_label, err) => {
    expect(defaultClassifyError(err)).toEqual({
      type: ConnectorErrorType.UNKNOWN,
      transient: false,
    });
  });
});

describe("wrapError", () => {
  it("uses the default classifier when the connector supplies none", () => {
    const raw = new Error("canceling statement due to statement timeout");
    const wrapped = wrapError(raw);
    expect(wrapped).toBeInstanceOf(ConnectorError);
    expect(wrapped.message).toBe(raw.message);
    expect(wrapped.type).toBe(ConnectorErrorType.UNKNOWN);
    expect(wrapped.originalError).toBe(raw);
  });

  it("classifies through the injected classifier", () => {
    const raw = { code: "E_BUSY", message: "try again" };
    const classify = jest.fn(() => ({
      type: ConnectorErrorType.CONNECTION,
      transient: true,
    }));
    const wrapped = wrapError(raw, classify);
    expect(classify).toHaveBeenCalledWith(raw);
    expect(wrapped.classification).toEqual({
      type: ConnectorErrorType.CONNECTION,
      transient: true,
    });
    expect(wrapped.message).toBe("try again");
    expect(wrapped.originalError).toBe(raw);
  });

  it("stringifies a thrown non-object", () => {
    expect(wrapError("boom").message).toBe("boom");
  });

  // #1898: a missing `$param_timeout` was typed TIMEOUT because its message
  // says "timeout". An error typed where it was raised is never re-read.
  it("returns an already-classified ConnectorError as it is, without consulting the classifier", () => {
    const typed = new ConnectorError(
      "Expected parameter(s): param_timeout",
      ConnectorErrorType.QUERY,
    );
    const classify = jest.fn(() => ({
      type: ConnectorErrorType.TIMEOUT,
      transient: true,
    }));
    expect(wrapError(typed, classify)).toBe(typed);
    expect(classify).not.toHaveBeenCalled();
  });
});
