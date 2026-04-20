import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildEntry,
  chooseLogLevel,
  isIdle,
  startSchedulerMetricsEmitter,
  stopSchedulerMetricsEmitter,
  type SchedulerMetricsEntry,
} from "@/lib/query/scheduler-metrics";
import type { SchedulerStats } from "@/lib/query/scheduler";

function baseEntry(
  overrides: Partial<SchedulerMetricsEntry> = {},
): SchedulerMetricsEntry {
  return {
    connectorId: "c1",
    queueDepth: 0,
    queueDepthByPriority: { p1: 0, p2: 0, p3: 0 },
    activeQueries: 0,
    activeByUser: {},
    rejectionsTotal: 0,
    shedTotal: 0,
    rejectionsDelta: 0,
    shedDelta: 0,
    avgWaitMs: 0,
    fillRatio: 0,
    ...overrides,
  };
}

function baseStats(overrides: Partial<SchedulerStats> = {}): SchedulerStats {
  return {
    queueDepth: 0,
    queueDepthByPriority: { p1: 0, p2: 0, p3: 0 },
    activeQueries: 0,
    activeByUser: {},
    rejectionsTotal: 0,
    shedTotal: 0,
    avgWaitMs: 0,
    ...overrides,
  };
}

describe("buildEntry", () => {
  it("computes positive deltas against previous totals", () => {
    const stats = baseStats({ rejectionsTotal: 7, shedTotal: 2 });
    const entry = buildEntry("c1", stats, 5, 1, 200);
    expect(entry.rejectionsDelta).toBe(2);
    expect(entry.shedDelta).toBe(1);
  });

  it("clamps negative deltas to zero (counter reset after restart)", () => {
    const stats = baseStats({ rejectionsTotal: 3, shedTotal: 0 });
    const entry = buildEntry("c1", stats, 10, 5, 200);
    expect(entry.rejectionsDelta).toBe(0);
    expect(entry.shedDelta).toBe(0);
  });

  it("computes fill ratio from queueDepth and maxQueueDepth", () => {
    const stats = baseStats({ queueDepth: 160 });
    const entry = buildEntry("c1", stats, 0, 0, 200);
    expect(entry.fillRatio).toBe(0.8);
  });

  it("handles maxQueueDepth=0 without dividing by zero", () => {
    const stats = baseStats({ queueDepth: 10 });
    const entry = buildEntry("c1", stats, 0, 0, 0);
    expect(entry.fillRatio).toBe(0);
  });
});

describe("chooseLogLevel", () => {
  it("returns 'error' when there are new rejections", () => {
    const entry = baseEntry({ rejectionsDelta: 1 });
    expect(chooseLogLevel(entry, 0.8)).toBe("error");
  });

  it("returns 'warn' on new sheds even if no rejections", () => {
    const entry = baseEntry({ shedDelta: 3 });
    expect(chooseLogLevel(entry, 0.8)).toBe("warn");
  });

  it("returns 'warn' when fill ratio meets the shed threshold", () => {
    const entry = baseEntry({ fillRatio: 0.8 });
    expect(chooseLogLevel(entry, 0.8)).toBe("warn");
  });

  it("returns 'info' for normal non-idle activity", () => {
    const entry = baseEntry({ queueDepth: 5, fillRatio: 0.05 });
    expect(chooseLogLevel(entry, 0.8)).toBe("info");
  });

  it("prefers 'error' over 'warn' when both apply", () => {
    const entry = baseEntry({
      rejectionsDelta: 1,
      shedDelta: 1,
      fillRatio: 0.9,
    });
    expect(chooseLogLevel(entry, 0.8)).toBe("error");
  });
});

describe("isIdle", () => {
  it("returns true for a fully idle scheduler", () => {
    expect(isIdle(baseEntry())).toBe(true);
  });

  it("returns false when queue has entries", () => {
    expect(isIdle(baseEntry({ queueDepth: 1 }))).toBe(false);
  });

  it("returns false when there are active queries", () => {
    expect(isIdle(baseEntry({ activeQueries: 1 }))).toBe(false);
  });

  it("returns false when there are new rejections", () => {
    expect(isIdle(baseEntry({ rejectionsDelta: 1 }))).toBe(false);
  });

  it("returns false when there are new sheds", () => {
    expect(isIdle(baseEntry({ shedDelta: 1 }))).toBe(false);
  });

  it("ignores cumulative totals when there are no deltas", () => {
    // Counter has accumulated but nothing happened this tick
    expect(isIdle(baseEntry({ rejectionsTotal: 100, shedTotal: 50 }))).toBe(
      true,
    );
  });
});

describe("_runTick", () => {
  let mockScheduler: { getStats: ReturnType<typeof vi.fn> };
  let mockLogger: {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.resetModules();
    mockScheduler = { getStats: vi.fn() };
    mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    vi.doMock("@/lib/query/scheduler-registry", () => ({
      listSchedulers: () => [{ connectionId: "c1", scheduler: mockScheduler }],
    }));
  });

  afterEach(() => {
    vi.doUnmock("@/lib/query/scheduler-registry");
  });

  async function reimport() {
    return await import("@/lib/query/scheduler-metrics");
  }

  it("skips idle schedulers entirely", async () => {
    mockScheduler.getStats.mockReturnValue(baseStats());
    const mod = await reimport();
    const prev = new Map();
    mod._runTick(prev, 200, 0.8, mockLogger);
    expect(mockLogger.info).not.toHaveBeenCalled();
    expect(mockLogger.warn).not.toHaveBeenCalled();
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it("emits info for active non-idle scheduler", async () => {
    mockScheduler.getStats.mockReturnValue(
      baseStats({ queueDepth: 3, activeQueries: 2 }),
    );
    const mod = await reimport();
    const prev = new Map();
    mod._runTick(prev, 200, 0.8, mockLogger);
    expect(mockLogger.info).toHaveBeenCalledTimes(1);
    const [payload, msg] = mockLogger.info.mock.calls[0];
    expect(msg).toBe("scheduler_stats");
    expect(payload.event).toBe("scheduler_stats");
    expect(payload.connectorId).toBe("c1");
    expect(payload.queueDepth).toBe(3);
  });

  it("emits error when rejections increased", async () => {
    mockScheduler.getStats.mockReturnValue(baseStats({ rejectionsTotal: 5 }));
    const mod = await reimport();
    const prev = new Map([["c1", { rejections: 0, sheds: 0 }]]);
    mod._runTick(prev, 200, 0.8, mockLogger);
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    const [payload] = mockLogger.error.mock.calls[0];
    expect(payload.rejectionsDelta).toBe(5);
  });

  it("emits warn when shed threshold breached", async () => {
    mockScheduler.getStats.mockReturnValue(baseStats({ queueDepth: 180 }));
    const mod = await reimport();
    const prev = new Map();
    mod._runTick(prev, 200, 0.8, mockLogger);
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
  });

  it("updates prevTotals after emitting", async () => {
    mockScheduler.getStats.mockReturnValue(
      baseStats({ rejectionsTotal: 5, shedTotal: 2 }),
    );
    const mod = await reimport();
    const prev = new Map();
    mod._runTick(prev, 200, 0.8, mockLogger);
    expect(prev.get("c1")).toEqual({ rejections: 5, sheds: 2 });
  });

  it("updates prevTotals even when scheduler is idle", async () => {
    mockScheduler.getStats.mockReturnValue(
      baseStats({ rejectionsTotal: 10, shedTotal: 4 }),
    );
    const mod = await reimport();
    const prev = new Map([["c1", { rejections: 10, sheds: 4 }]]);
    mod._runTick(prev, 200, 0.8, mockLogger);
    expect(prev.get("c1")).toEqual({ rejections: 10, sheds: 4 });
    expect(mockLogger.info).not.toHaveBeenCalled();
  });

  it("subsequent tick with no new rejections does not re-emit error", async () => {
    mockScheduler.getStats.mockReturnValue(baseStats({ rejectionsTotal: 5 }));
    const mod = await reimport();
    const prev = new Map();
    mod._runTick(prev, 200, 0.8, mockLogger);
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    mockLogger.error.mockClear();

    // Second tick — totals unchanged, queue empty → idle → no log
    mod._runTick(prev, 200, 0.8, mockLogger);
    expect(mockLogger.error).not.toHaveBeenCalled();
    expect(mockLogger.info).not.toHaveBeenCalled();
  });
});

describe("startSchedulerMetricsEmitter", () => {
  afterEach(() => {
    stopSchedulerMetricsEmitter();
  });

  it("is idempotent — second call returns a stop handle without starting a second timer", () => {
    const stop1 = startSchedulerMetricsEmitter(60_000);
    const stop2 = startSchedulerMetricsEmitter(60_000);
    expect(typeof stop1).toBe("function");
    expect(typeof stop2).toBe("function");
    stop1();
    // After stopping, starting again should return a fresh timer handle
    const stop3 = startSchedulerMetricsEmitter(60_000);
    expect(typeof stop3).toBe("function");
    stop3();
  });

  it("stopSchedulerMetricsEmitter is safe to call when not running", () => {
    expect(() => stopSchedulerMetricsEmitter()).not.toThrow();
  });
});
