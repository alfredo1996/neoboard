import pino from "pino";
import { anonymizeLogRecord } from "./log-anonymizer";
import { redactSecrets, redactString } from "./log-redact";
import { buildTransport } from "./logger-transports";

/**
 * NeoBoard structured logger.
 *
 * Env-var driven. Default: synchronous JSON to stdout — hot path, zero
 * overhead, 12-factor friendly. Everything else (file output, rotation,
 * pretty formatting, anonymization) is opt-in via env vars.
 *
 * Usage:
 *   import { logger, queryLogger, authLogger } from "@/lib/logger";
 *   queryLogger.info({ event: "query_executed", durationMs, ... }, "query_executed");
 *
 * Env vars:
 *   LOG_LEVEL      — error | warn | info | debug   (default: info)
 *   LOG_FORMAT     — json | pretty                 (default: json)
 *   LOG_OUTPUT     — stdout | file | both          (default: stdout)
 *   LOG_FILE_PATH  — file destination              (default: ./logs/neoboard.log)
 *   LOG_MAX_SIZE   — rotation threshold            (default: 50M)
 *   LOG_MAX_FILES  — retained rotated files        (default: 7)
 *   LOG_ANONYMIZE  — true | false  (default: false) — when true, every
 *                    log call is additionally routed through the anonymizer
 *                    which hashes userId/email, redacts query params, and
 *                    masks the DB *username* too. Privacy, not secrecy.
 *   LOG_QUERY_TEXT — true | false  (default: true)  — see log-redact.ts.
 *
 * Credential redaction is NOT env-gated and NOT opt-in: `log-redact.ts` runs
 * on every log call (see `formatters.log` and `hooks.logMethod` below), so a
 * new call site cannot leak a password by forgetting to ask for redaction.
 *
 * Always pair the structured object with a short message string so the
 * log index and the human-readable format both carry signal.
 */

const LOG_LEVEL = process.env.LOG_LEVEL?.toLowerCase() || "info";
const LOG_ANONYMIZE = process.env.LOG_ANONYMIZE?.toLowerCase() === "true";

function normaliseLevel(level: string): pino.Level {
  const allowed: pino.Level[] = [
    "fatal",
    "error",
    "warn",
    "info",
    "debug",
    "trace",
  ];
  return (allowed as string[]).includes(level) ? (level as pino.Level) : "info";
}

export function buildOptions(): pino.LoggerOptions {
  const base: pino.LoggerOptions = {
    level: normaliseLevel(LOG_LEVEL),
    base: {
      service: "neoboard",
      env: process.env.NODE_ENV ?? "development",
    },
    formatters: {
      // The boundary every log record passes through, on every logger. It
      // also serializes Errors (type, message, stack, code — flattened
      // across the `cause` chain), which is why `serializers:
      // pino.stdSerializers` is gone: pino's `err` serializer only ever sees
      // the top-level `err` key, so an Error nested in an object or an array
      // escaped it entirely.
      log: (obj) => redactSecrets(obj) as Record<string, unknown>,
    },
    serializers: {
      // Identity, on purpose. `formatters.log` runs first and has already
      // turned every Error into a plain {type, message, stack, code} object;
      // pino's *default* err serializer would then run over that plain object
      // and rewrite `type` to "Object", losing the real error class.
      err: (value: unknown) => value,
    },
    // Child *bindings* are stringified when the child is created, before
    // `formatters.log` exists — pino resets the bindings formatter in
    // `child()`. This is the only thing covering `logger.child({ ... })`,
    // so it stays.
    redact: {
      paths: [
        "password",
        "passwordHash",
        "*.password",
        "*.passwordHash",
        "credentials",
        "*.credentials",
        "token",
        "*.token",
        "authorization",
        "*.authorization",
      ],
      censor: "[REDACTED]",
    },
    hooks: {
      logMethod(args: Parameters<pino.LogFn>, method: pino.LogFn): void {
        // `formatters.log` never sees the message, nor printf-style
        // interpolation arguments — so scrub the strings here.
        for (let i = 0; i < args.length; i++) {
          const arg = args[i];
          if (typeof arg === "string") args[i] = redactString(arg);
        }
        // `logger.error(err)` with no message: pino falls back to
        // `err.message` verbatim. Supply a scrubbed one instead.
        if (args.length === 1 && args[0] instanceof Error) {
          args[1] = redactString(args[0].message);
        }
        if (LOG_ANONYMIZE) {
          const first = args[0];
          if (first && typeof first === "object" && !Array.isArray(first)) {
            args[0] = anonymizeLogRecord(first as Record<string, unknown>);
          }
        }
        return method.apply(this, args);
      },
    },
  };

  const transport = buildTransport();
  if (transport) {
    base.transport = transport;
  }

  return base;
}

/** Root logger. Prefer a child logger (queryLogger, authLogger, etc.). */
export const logger = pino(buildOptions());

/** Child logger for query execution audit entries. */
export const queryLogger = logger.child({ module: "query" });

/** Child logger for auth events (sign-in, sign-out, failures). */
export const authLogger = logger.child({ module: "auth" });

/** Child logger for API request/response lifecycle. */
export const apiLogger = logger.child({ module: "api" });
