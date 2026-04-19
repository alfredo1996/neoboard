import pino from "pino";
import { anonymizeLogRecord } from "./log-anonymizer";
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
 *                    log call is routed through the anonymizer which
 *                    hashes userId/email, redacts params/tokens, and
 *                    masks connection URIs before pino serialises.
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

function buildOptions(): pino.LoggerOptions {
  const base: pino.LoggerOptions = {
    level: normaliseLevel(LOG_LEVEL),
    base: {
      service: "neoboard",
      env: process.env.NODE_ENV ?? "development",
    },
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
    ...(LOG_ANONYMIZE && {
      hooks: {
        logMethod(args: Parameters<pino.LogFn>, method: pino.LogFn): void {
          const first = args[0];
          if (first && typeof first === "object" && !Array.isArray(first)) {
            args[0] = anonymizeLogRecord(first as Record<string, unknown>);
          }
          return method.apply(this, args);
        },
      },
    }),
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
