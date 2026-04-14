import pino from "pino";
import { anonymizeLogRecord } from "./log-anonymizer";

/**
 * NeoBoard structured logger.
 *
 * Env-var driven, stdout-only. File transport ships in a follow-up PR
 * (#555); anonymization ships here (#554).
 *
 * Usage:
 *   import { logger, queryLogger, authLogger } from "@/lib/logger";
 *   queryLogger.info({ event: "query_executed", durationMs, ... }, "query_executed");
 *
 * Env vars:
 *   LOG_LEVEL      — error | warn | info | debug (default: info)
 *   LOG_FORMAT     — json | pretty (default: json)
 *   LOG_ANONYMIZE  — true | false  (default: false) — when true, every
 *                    log call is routed through the anonymizer which
 *                    hashes userId/email, redacts params/tokens, and
 *                    masks connection URIs before pino serialises.
 *
 * Always pair the structured object with a short message string so the
 * log index and the human-readable format both carry signal.
 */

const LOG_LEVEL = process.env.LOG_LEVEL?.toLowerCase() || "info";
const LOG_FORMAT = process.env.LOG_FORMAT?.toLowerCase() || "json";
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
    // Redact paths that accidentally hold credentials or tokens. Defense
    // in depth — core code should never log these, but if it does, pino
    // will mask the value before hitting stdout.
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
    // When LOG_ANONYMIZE=true, intercept every log call and run the
    // anonymizer over the structured object before pino processes it.
    // Disabled (hook omitted entirely) by default so there is zero
    // overhead on the hot path when anonymization is off.
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

  if (LOG_FORMAT === "pretty") {
    // pino-pretty is a devDependency — only required when LOG_FORMAT=pretty
    // is set, which is a dev-only setting. Production (LOG_FORMAT=json)
    // never imports it.
    return {
      ...base,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          ignore: "pid,hostname,service,env",
          translateTime: "HH:MM:ss.l",
        },
      },
    };
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
