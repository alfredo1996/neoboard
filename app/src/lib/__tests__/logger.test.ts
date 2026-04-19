import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("logger", () => {
  const original = {
    LOG_LEVEL: process.env.LOG_LEVEL,
    LOG_FORMAT: process.env.LOG_FORMAT,
    LOG_ANONYMIZE: process.env.LOG_ANONYMIZE,
    NODE_ENV: process.env.NODE_ENV,
  };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(original)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("exports root, query, auth, and api loggers", async () => {
    const mod = await import("../logger");
    expect(typeof mod.logger.info).toBe("function");
    expect(typeof mod.queryLogger.info).toBe("function");
    expect(typeof mod.authLogger.info).toBe("function");
    expect(typeof mod.apiLogger.info).toBe("function");
  });

  it("defaults to info level when LOG_LEVEL is unset", async () => {
    delete process.env.LOG_LEVEL;
    const { logger } = await import("../logger");
    expect(logger.level).toBe("info");
  });

  it("respects LOG_LEVEL env var", async () => {
    process.env.LOG_LEVEL = "debug";
    const { logger } = await import("../logger");
    expect(logger.level).toBe("debug");
  });

  it("falls back to info for an unknown LOG_LEVEL", async () => {
    process.env.LOG_LEVEL = "yelling";
    const { logger } = await import("../logger");
    expect(logger.level).toBe("info");
  });

  it("child loggers inherit the configured level", async () => {
    process.env.LOG_LEVEL = "warn";
    const { queryLogger, logger } = await import("../logger");
    expect(logger.level).toBe("warn");
    expect(queryLogger.level).toBe("warn");
  });

  it("accepts uppercase LOG_LEVEL values", async () => {
    process.env.LOG_LEVEL = "DEBUG";
    const { logger } = await import("../logger");
    expect(logger.level).toBe("debug");
  });

  describe("LOG_ANONYMIZE hook installation", () => {
    // Pino uses SonicBoom which writes directly to fd 1 in production
    // mode, bypassing process.stdout.write — we can't cleanly capture
    // stdout in-process. Instead we spy on the anonymizer module and
    // verify the hook routes calls through it when LOG_ANONYMIZE=true.

    it("does NOT call the anonymizer when LOG_ANONYMIZE is unset", async () => {
      delete process.env.LOG_ANONYMIZE;
      const spy = vi.fn((o: Record<string, unknown>) => o);
      vi.doMock("@/lib/log-anonymizer", () => ({
        anonymizeLogRecord: spy,
        hashValue: (v: string) => v,
        maskUri: (v: string) => v,
      }));
      const { logger } = await import("../logger");
      logger.info({ userId: "user-42" }, "test");
      expect(spy).not.toHaveBeenCalled();
      vi.doUnmock("@/lib/log-anonymizer");
    });

    it("does NOT call the anonymizer when LOG_ANONYMIZE is 'false'", async () => {
      process.env.LOG_ANONYMIZE = "false";
      const spy = vi.fn((o: Record<string, unknown>) => o);
      vi.doMock("@/lib/log-anonymizer", () => ({
        anonymizeLogRecord: spy,
        hashValue: (v: string) => v,
        maskUri: (v: string) => v,
      }));
      const { logger } = await import("../logger");
      logger.info({ userId: "user-42" }, "test");
      expect(spy).not.toHaveBeenCalled();
      vi.doUnmock("@/lib/log-anonymizer");
    });

    it("routes every log call through the anonymizer when LOG_ANONYMIZE='true'", async () => {
      process.env.LOG_ANONYMIZE = "true";
      const spy = vi.fn((o: Record<string, unknown>) => ({
        ...o,
        stamped: true,
      }));
      vi.doMock("@/lib/log-anonymizer", () => ({
        anonymizeLogRecord: spy,
        hashValue: (v: string) => v,
        maskUri: (v: string) => v,
      }));
      const { logger } = await import("../logger");
      logger.info({ userId: "user-42" }, "test");
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "user-42" }),
      );
      vi.doUnmock("@/lib/log-anonymizer");
    });

    it("accepts uppercase LOG_ANONYMIZE='TRUE'", async () => {
      process.env.LOG_ANONYMIZE = "TRUE";
      const spy = vi.fn((o: Record<string, unknown>) => o);
      vi.doMock("@/lib/log-anonymizer", () => ({
        anonymizeLogRecord: spy,
        hashValue: (v: string) => v,
        maskUri: (v: string) => v,
      }));
      const { logger } = await import("../logger");
      logger.info({ userId: "u1" }, "test");
      expect(spy).toHaveBeenCalled();
      vi.doUnmock("@/lib/log-anonymizer");
    });

    it("child loggers also run through the anonymizer", async () => {
      process.env.LOG_ANONYMIZE = "true";
      const spy = vi.fn((o: Record<string, unknown>) => o);
      vi.doMock("@/lib/log-anonymizer", () => ({
        anonymizeLogRecord: spy,
        hashValue: (v: string) => v,
        maskUri: (v: string) => v,
      }));
      const { queryLogger } = await import("../logger");
      queryLogger.info({ userId: "u1", email: "a@b.c" }, "test");
      expect(spy).toHaveBeenCalled();
      vi.doUnmock("@/lib/log-anonymizer");
    });
  });
});
