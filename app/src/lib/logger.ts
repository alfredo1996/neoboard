import pino from "pino";

/**
 * Structured logger for server-side code.
 *
 * - Production: JSON output to stdout (for log aggregators)
 * - Development: Pretty-printed colored output
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   logger.info({ userId, action: "dashboard.create" }, "Dashboard created");
 *   logger.error({ err, connectionId }, "Query execution failed");
 *
 * NEVER log: passwords, credentials, ENCRYPTION_KEY, query parameters,
 * raw database connection strings, or other secrets.
 */
export const logger = pino({
  level:
    process.env.LOG_LEVEL ??
    (process.env.NODE_ENV === "test" ? "silent" : "info"),
  transport:
    process.env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Redact sensitive fields if they accidentally appear in log context
  redact: {
    paths: [
      "password",
      "passwordHash",
      "encryptionKey",
      "ENCRYPTION_KEY",
      "secret",
      "clientSecret",
      "accessToken",
      "refreshToken",
      "configEncrypted",
    ],
    censor: "[REDACTED]",
  },
});
