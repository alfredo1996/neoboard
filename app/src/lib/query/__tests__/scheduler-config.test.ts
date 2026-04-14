import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  readSchedulerConfig,
  SCHEDULER_DEFAULTS,
} from "@/lib/query/scheduler-config";

describe("readSchedulerConfig", () => {
  const keys = [
    "QUERY_MAX_CONCURRENT",
    "QUERY_MAX_PER_USER",
    "QUERY_MAX_QUEUE_DEPTH",
    "QUERY_QUEUE_TIMEOUT_MS",
    "QUERY_SHED_THRESHOLD",
  ] as const;

  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of keys) {
      original[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of keys) {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k];
    }
  });

  it("returns the defaults when no env vars are set", () => {
    expect(readSchedulerConfig()).toEqual(SCHEDULER_DEFAULTS);
  });

  it("honours valid overrides", () => {
    process.env.QUERY_MAX_CONCURRENT = "25";
    process.env.QUERY_MAX_PER_USER = "8";
    process.env.QUERY_MAX_QUEUE_DEPTH = "500";
    process.env.QUERY_QUEUE_TIMEOUT_MS = "30000";
    process.env.QUERY_SHED_THRESHOLD = "0.9";
    expect(readSchedulerConfig()).toEqual({
      maxConcurrent: 25,
      maxPerUser: 8,
      maxQueueDepth: 500,
      queueTimeoutMs: 30_000,
      shedThreshold: 0.9,
    });
  });

  it("falls back to defaults on non-numeric input", () => {
    process.env.QUERY_MAX_CONCURRENT = "lots";
    process.env.QUERY_SHED_THRESHOLD = "yes";
    const cfg = readSchedulerConfig();
    expect(cfg.maxConcurrent).toBe(SCHEDULER_DEFAULTS.maxConcurrent);
    expect(cfg.shedThreshold).toBe(SCHEDULER_DEFAULTS.shedThreshold);
  });

  it("falls back to defaults on zero or negative integer inputs", () => {
    process.env.QUERY_MAX_CONCURRENT = "0";
    process.env.QUERY_MAX_PER_USER = "-1";
    const cfg = readSchedulerConfig();
    expect(cfg.maxConcurrent).toBe(SCHEDULER_DEFAULTS.maxConcurrent);
    expect(cfg.maxPerUser).toBe(SCHEDULER_DEFAULTS.maxPerUser);
  });

  it("clamps shedThreshold to the 0..1 range", () => {
    process.env.QUERY_SHED_THRESHOLD = "1.5";
    expect(readSchedulerConfig().shedThreshold).toBe(
      SCHEDULER_DEFAULTS.shedThreshold,
    );
    process.env.QUERY_SHED_THRESHOLD = "-0.1";
    expect(readSchedulerConfig().shedThreshold).toBe(
      SCHEDULER_DEFAULTS.shedThreshold,
    );
  });

  it("accepts shedThreshold=0 and shedThreshold=1", () => {
    process.env.QUERY_SHED_THRESHOLD = "0";
    expect(readSchedulerConfig().shedThreshold).toBe(0);
    process.env.QUERY_SHED_THRESHOLD = "1";
    expect(readSchedulerConfig().shedThreshold).toBe(1);
  });
});
