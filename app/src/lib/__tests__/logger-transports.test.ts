import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type pino from "pino";
import { buildTransport, readTransportConfig } from "@/lib/logger-transports";

/**
 * pino.TransportTargetOptions is a union with TransportPipelineOptions
 * that doesn't carry a `target` field. Our buildTransport only emits
 * the single-target variant, so we narrow via this helper to keep the
 * tests readable without scattering casts.
 */
type SingleTarget = pino.TransportTargetOptions;
function targetsOf(
  result: pino.TransportMultiOptions | undefined,
): SingleTarget[] {
  return (result?.targets ?? []) as SingleTarget[];
}

describe("logger-transports", () => {
  const original = {
    LOG_OUTPUT: process.env.LOG_OUTPUT,
    LOG_FORMAT: process.env.LOG_FORMAT,
    LOG_FILE_PATH: process.env.LOG_FILE_PATH,
    LOG_MAX_SIZE: process.env.LOG_MAX_SIZE,
    LOG_MAX_FILES: process.env.LOG_MAX_FILES,
  };

  beforeEach(() => {
    for (const k of Object.keys(original)) {
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(original)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  describe("readTransportConfig", () => {
    it("applies defaults when no env vars are set", () => {
      const config = readTransportConfig();
      expect(config.output).toBe("stdout");
      expect(config.format).toBe("json");
      expect(config.filePath).toBe("./logs/neoboard.log");
      expect(config.maxSize).toBe("50M");
      expect(config.maxFiles).toBe(7);
    });

    it("reads LOG_OUTPUT values", () => {
      process.env.LOG_OUTPUT = "file";
      expect(readTransportConfig().output).toBe("file");
      process.env.LOG_OUTPUT = "both";
      expect(readTransportConfig().output).toBe("both");
      process.env.LOG_OUTPUT = "stdout";
      expect(readTransportConfig().output).toBe("stdout");
    });

    it("falls back to stdout for unknown LOG_OUTPUT values", () => {
      process.env.LOG_OUTPUT = "syslog";
      expect(readTransportConfig().output).toBe("stdout");
    });

    it("is case-insensitive for LOG_OUTPUT", () => {
      process.env.LOG_OUTPUT = "FILE";
      expect(readTransportConfig().output).toBe("file");
    });

    it("reads LOG_FORMAT", () => {
      process.env.LOG_FORMAT = "pretty";
      expect(readTransportConfig().format).toBe("pretty");
      process.env.LOG_FORMAT = "json";
      expect(readTransportConfig().format).toBe("json");
    });

    it("falls back to json for unknown LOG_FORMAT", () => {
      process.env.LOG_FORMAT = "xml";
      expect(readTransportConfig().format).toBe("json");
    });

    it("reads LOG_FILE_PATH override", () => {
      process.env.LOG_FILE_PATH = "/var/log/neoboard.log";
      expect(readTransportConfig().filePath).toBe("/var/log/neoboard.log");
    });

    it("reads LOG_MAX_SIZE override", () => {
      process.env.LOG_MAX_SIZE = "100M";
      expect(readTransportConfig().maxSize).toBe("100M");
    });

    it("reads LOG_MAX_FILES as an integer", () => {
      process.env.LOG_MAX_FILES = "14";
      expect(readTransportConfig().maxFiles).toBe(14);
    });

    it("falls back to default maxFiles for non-numeric input", () => {
      process.env.LOG_MAX_FILES = "many";
      expect(readTransportConfig().maxFiles).toBe(7);
    });

    it("falls back to default maxFiles for zero or negative input", () => {
      process.env.LOG_MAX_FILES = "0";
      expect(readTransportConfig().maxFiles).toBe(7);
      process.env.LOG_MAX_FILES = "-1";
      expect(readTransportConfig().maxFiles).toBe(7);
    });
  });

  describe("buildTransport — stdout (default)", () => {
    it("returns undefined for stdout + json (sync hot path)", () => {
      const result = buildTransport({
        output: "stdout",
        format: "json",
        filePath: "./logs/neoboard.log",
        maxSize: "50M",
        maxFiles: 7,
      });
      expect(result).toBeUndefined();
    });

    it("returns a pino-pretty target for stdout + pretty", () => {
      const result = buildTransport({
        output: "stdout",
        format: "pretty",
        filePath: "./logs/neoboard.log",
        maxSize: "50M",
        maxFiles: 7,
      });
      expect(result).toBeDefined();
      const ts = targetsOf(result);
      expect(ts).toHaveLength(1);
      expect(ts[0].target).toBe("pino-pretty");
    });
  });

  describe("buildTransport — file only", () => {
    it("returns a pino-roll target with the configured file path and rotation", () => {
      const result = buildTransport({
        output: "file",
        format: "json",
        filePath: "/var/log/neoboard.log",
        maxSize: "100M",
        maxFiles: 14,
      });
      expect(result).toBeDefined();
      const ts = targetsOf(result);
      expect(ts).toHaveLength(1);
      const target = ts[0];
      expect(target.target).toBe("pino-roll");
      expect(target.options).toMatchObject({
        file: "/var/log/neoboard.log",
        size: "100M",
        mkdir: true,
        limit: { count: 14 },
      });
    });

    it("creates parent directories when writing to a nested file path", () => {
      const result = buildTransport({
        output: "file",
        format: "json",
        filePath: "./logs/nested/path/app.log",
        maxSize: "50M",
        maxFiles: 7,
      });
      expect(targetsOf(result)[0].options).toMatchObject({ mkdir: true });
    });
  });

  describe("buildTransport — both (stdout + file)", () => {
    it("returns two targets: stdout and pino-roll", () => {
      const result = buildTransport({
        output: "both",
        format: "json",
        filePath: "./logs/neoboard.log",
        maxSize: "50M",
        maxFiles: 7,
      });
      expect(result).toBeDefined();
      const ts = targetsOf(result);
      expect(ts).toHaveLength(2);
      const targetNames = ts.map((t) => t.target);
      expect(targetNames).toContain("pino/file");
      expect(targetNames).toContain("pino-roll");
    });

    it("uses pino-pretty instead of pino/file when format=pretty", () => {
      const result = buildTransport({
        output: "both",
        format: "pretty",
        filePath: "./logs/neoboard.log",
        maxSize: "50M",
        maxFiles: 7,
      });
      const targetNames = targetsOf(result).map((t) => t.target);
      expect(targetNames).toContain("pino-pretty");
      expect(targetNames).toContain("pino-roll");
      expect(targetNames).not.toContain("pino/file");
    });
  });

  describe("buildTransport — levels", () => {
    it("sets each target level to trace so the logger's own level wins", () => {
      const result = buildTransport({
        output: "both",
        format: "json",
        filePath: "./logs/neoboard.log",
        maxSize: "50M",
        maxFiles: 7,
      });
      for (const target of targetsOf(result)) {
        expect(target.level).toBe("trace");
      }
    });
  });
});
