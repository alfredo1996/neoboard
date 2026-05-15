import { describe, it, expect } from "vitest";
import { logger } from "@/lib/logger";

describe("logger", () => {
  it("exports a pino logger instance", () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.debug).toBe("function");
  });

  it("has level set to silent in test environment", () => {
    expect(logger.level).toBe("silent");
  });

  it("supports child loggers with context", () => {
    const child = logger.child({ module: "auth" });
    expect(child).toBeDefined();
    expect(typeof child.info).toBe("function");
  });

  it("redacts sensitive fields without throwing", () => {
    // The redact config is applied at construction — verify logger doesn't throw
    // when logging objects with sensitive keys (silent mode suppresses output)
    expect(() => {
      logger.info({ password: "secret123", user: "test" }, "test log");
    }).not.toThrow();
  });
});
