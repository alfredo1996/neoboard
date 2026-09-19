/**
 * Table-driven error classification (#1903).
 *
 * A connector knows its driver's codes and phrases; what to DO with them — walk
 * the rules in order, let "permanent" beat "transient" — is the same for every
 * connector, so it lives here once. A `classifyError` hook is then data:
 *
 *   export const classifyMydbError = createErrorClassifier({
 *     types: [
 *       { codes: ["E_LOGIN"], type: ConnectorErrorType.AUTHENTICATION },
 *       { ...UNREACHABLE_HOST_SIGNALS, type: ConnectorErrorType.NETWORK },
 *     ],
 *     permanent: PERMANENT_FAILURE_SIGNALS,
 *     transient: TRANSIENT_FAILURE_SIGNALS,
 *   });
 *
 * Nothing obliges a connector to use it: any function returning a
 * {@link ConnectorErrorClassification} is a valid hook.
 */

import {
  ConnectorErrorType,
  type ClassifyError,
  type ConnectorConstraintKind,
  type ConnectorErrorClassification,
} from "./ConnectorError";

/**
 * Ways to recognise an error. A driver's `code` is authoritative, so it matches
 * exactly (or by prefix) and case-sensitively; `phrases` are LOWERCASE
 * substrings of the message, for the errors that carry no code.
 */
export interface ErrorSignals {
  codes?: readonly string[];
  codePrefixes?: readonly string[];
  phrases?: readonly string[];
  patterns?: readonly RegExp[];
}

export interface ErrorClassifierTables {
  /** Walked in order: the first rule that matches names the type. No match is a `QUERY` error. */
  types: readonly (ErrorSignals & { type: ConnectorErrorType })[];
  /** Never worth a retry. Beats `transient` when both match: `syntax error near "timeout"` fails the same way twice. */
  permanent: ErrorSignals;
  transient: ErrorSignals;
  /** Driver code → the schema rule that was broken. A match is a `CONSTRAINT` error whatever `types` says. */
  constraints?: ReadonlyMap<string, ConnectorConstraintKind>;
  /** What a write stopped by read-only execution looks like. */
  blockedWrite?: ErrorSignals;
}

/** All a classifier reads: the driver's code and its message, lowercased. */
interface ErrorFacts {
  code: string;
  message: string;
}

function errorFacts(err: unknown): ErrorFacts | undefined {
  if (!err || typeof err !== "object") return undefined;
  const { code, message } = err as { code?: unknown; message?: unknown };
  return {
    code: typeof code === "string" ? code : "",
    message: typeof message === "string" ? message.toLowerCase() : "",
  };
}

function matchesCode(code: string, signals: ErrorSignals): boolean {
  if (code === "") return false;
  return (
    (signals.codes?.includes(code) ?? false) ||
    (signals.codePrefixes?.some((prefix) => code.startsWith(prefix)) ?? false)
  );
}

function matches(facts: ErrorFacts, signals: ErrorSignals): boolean {
  return (
    matchesCode(facts.code, signals) ||
    (signals.phrases?.some((phrase) => facts.message.includes(phrase)) ??
      false) ||
    (signals.patterns?.some((pattern) => pattern.test(facts.message)) ?? false)
  );
}

/** Build a `classifyError` hook from a connector's tables. */
export function createErrorClassifier(
  tables: ErrorClassifierTables,
): ClassifyError {
  return (err) => {
    const facts = errorFacts(err);
    if (!facts) return { type: ConnectorErrorType.UNKNOWN, transient: false };

    const kind = tables.constraints?.get(facts.code);
    const classification: ConnectorErrorClassification = {
      type: kind
        ? ConnectorErrorType.CONSTRAINT
        : (tables.types.find((rule) => matches(facts, rule))?.type ??
          ConnectorErrorType.QUERY),
      transient:
        !matches(facts, tables.permanent) && matches(facts, tables.transient),
    };
    if (kind) classification.constraint = { kind };
    if (tables.blockedWrite && matches(facts, tables.blockedWrite)) {
      classification.blockedWrite = true;
    }
    return classification;
  };
}

/** One set of signals out of several — a shared set plus a connector's own. */
export function mergeSignals(...all: ErrorSignals[]): ErrorSignals {
  return {
    codes: all.flatMap((signals) => signals.codes ?? []),
    codePrefixes: all.flatMap((signals) => signals.codePrefixes ?? []),
    phrases: all.flatMap((signals) => signals.phrases ?? []),
    patterns: all.flatMap((signals) => signals.patterns ?? []),
  };
}

// ── Signals no driver owns ───────────────────────────────────────────
// They come from the platform — Node's sockets, `new URL()`, the JS runtime —
// so every connector sees them worded the same way.

/** A URI nothing could parse. */
export const MALFORMED_URI_SIGNALS: ErrorSignals = {
  phrases: [
    "invalid uri",
    "invalid connection uri",
    "invalid url",
    "could not parse uri",
    "could not parse url",
    "uri malformed",
    "url malformed",
    "unknown scheme",
  ],
};

/** Nothing answered at the socket: refused port, failed DNS, unroutable host. */
export const UNREACHABLE_HOST_SIGNALS: ErrorSignals = {
  phrases: [
    "econnrefused",
    "enotfound",
    "etimedout",
    "ehostunreach",
    "network is unreachable",
    "connection refused",
    "host is down",
  ],
};

/**
 * Failures a retry cannot fix: a port that refuses or a name that does not
 * resolve will do so again, and a runtime crash is a bug, whatever word its
 * message happens to contain.
 */
export const PERMANENT_FAILURE_SIGNALS: ErrorSignals = {
  codes: ["ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH"],
  phrases: [
    "econnrefused",
    "enotfound",
    "cannot read properties",
    "cannot find module",
  ],
};

/** Timeouts and dropped sockets: the same request usually succeeds a moment later. */
export const TRANSIENT_FAILURE_SIGNALS: ErrorSignals = {
  codes: ["ETIMEDOUT", "ECONNRESET", "EPIPE", "ESOCKETTIMEDOUT"],
  phrases: [
    "etimedout",
    "timed out",
    "timeout",
    "econnreset",
    "connection reset",
    "broken pipe",
    "socket hang up",
    "epipe",
  ],
};
