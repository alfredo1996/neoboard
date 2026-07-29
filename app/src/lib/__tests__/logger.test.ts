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

  describe("secret redaction is on by DEFAULT", () => {
    // These drive a real pino instance built from the app's own options and
    // capture the exact bytes that would hit stdout. Every assertion looks
    // for the secret STRING anywhere in the line — a `password` key going
    // missing proves nothing when the same value rides along in a URI, a
    // driver message or a stack frame.
    const SECRET = "Tr0ub4dor-hunter2";

    /** Build a logger from the app's options, writing into a capture buffer. */
    async function capture(
      emit: (log: import("pino").Logger) => void,
    ): Promise<string> {
      const pino = (await import("pino")).default;
      const { buildOptions } = await import("../logger");
      let written = "";
      const sink = {
        write(chunk: string) {
          written += chunk;
        },
      };
      emit(
        pino(
          buildOptions(),
          sink as unknown as import("pino").DestinationStream,
        ),
      );
      return written;
    }

    beforeEach(() => {
      delete process.env.LOG_ANONYMIZE;
      delete process.env.LOG_QUERY_TEXT;
    });

    it("scrubs a connection URI password with LOG_ANONYMIZE unset", async () => {
      const out = await capture((l) =>
        l.info(
          { uri: `postgresql://neoboard:${SECRET}@db.internal:5432/analytics` },
          "connection_configured",
        ),
      );
      expect(out).not.toContain(SECRET);
      expect(out).toContain("db.internal");
    });

    it("scrubs a URI held under an unlisted key name", async () => {
      const out = await capture((l) =>
        l.info(
          { config: { whateverKey: `bolt://neo4j:${SECRET}@graph:7687` } },
          "loaded",
        ),
      );
      expect(out).not.toContain(SECRET);
    });

    it("scrubs a secret carried by a thrown driver error", async () => {
      const err = new Error(
        `password authentication failed for postgresql://neoboard:${SECRET}@db.internal:5432/analytics`,
      );
      (err as Error & { code?: string }).code = "28P01";
      const out = await capture((l) => l.error({ err }, "query_failed"));
      expect(out).not.toContain(SECRET);
      expect(out).toContain("28P01");
      expect(out).toContain("password authentication failed");
      // Redaction must not cost the ELK pipeline its error shape.
      expect(out).toContain('"type":"Error"');
      expect(out).toContain('"stack":');
    });

    it("scrubs a secret hidden in an Error cause chain", async () => {
      const root = new Error(`bad creds: neo4j://neo4j:${SECRET}@graph:7687`);
      const err = new Error("Connection test failed", { cause: root });
      const out = await capture((l) => l.error({ err }, "connection_failed"));
      expect(out).not.toContain(SECRET);
      expect(out).toContain("Connection test failed");
    });

    it("scrubs the message string itself", async () => {
      const out = await capture((l) =>
        l.info({}, `connecting to postgresql://u:${SECRET}@h:5432/d`),
      );
      expect(out).not.toContain(SECRET);
    });

    it("scrubs a bare Error logged with no message argument", async () => {
      const out = await capture((l) =>
        l.error(new Error(`connect failed: postgresql://u:${SECRET}@h:5432/d`)),
      );
      expect(out).not.toContain(SECRET);
    });

    it("scrubs secrets logged through a child logger", async () => {
      const out = await capture((l) =>
        l.child({ module: "query" }).warn({ password: SECRET }, "oops"),
      );
      expect(out).not.toContain(SECRET);
      expect(out).toContain('"module":"query"');
    });

    it("still emits query text by default", async () => {
      const out = await capture((l) =>
        l.info({ query: "MATCH (n) RETURN n" }, "query_executed"),
      );
      expect(out).toContain("MATCH (n) RETURN n");
    });
  });
});
