import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("logger", () => {
  const original = {
    LOG_LEVEL: process.env.LOG_LEVEL,
    LOG_FORMAT: process.env.LOG_FORMAT,
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
});
