import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeSelectChain, sqlValues } from "@/__tests__/helpers/drizzle-mocks";
import { applySettingRows, getSetting, SettingsValidationError } from "../core";

const mockDb = { select: vi.fn(), transaction: vi.fn() };
vi.mock("@/lib/db", () => ({ db: mockDb }));

const { refreshSettings, saveSettings, startSettingsRefresh, SETTINGS_TTL_MS } =
  await import("../store");

const row = (key: string, value: unknown) => ({
  key,
  value,
  updatedBy: "u1",
  updatedByName: "Ada",
  updatedAt: new Date(),
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TENANT_ID = "t-1";
  applySettingRows([]);
});
afterEach(() => {
  delete process.env.TENANT_ID;
});

describe("refreshSettings", () => {
  it("reads only the tenant's rows and makes them the cache", async () => {
    const chain = makeSelectChain([row("QUERY_MAX_CONCURRENT", 33)]);
    mockDb.select.mockReturnValueOnce(chain);
    await refreshSettings();
    expect(sqlValues(chain.calls.where[0][0])).toEqual(["t-1"]);
    expect(getSetting("QUERY_MAX_CONCURRENT")).toBe(33);
  });
});

describe("refresh ordering", () => {
  it("a refresh that started earlier and lands later does not undo a newer one", async () => {
    let releaseOld!: (rows: unknown[]) => void;
    const old = new Promise<unknown[]>((r) => (releaseOld = r));
    mockDb.select
      .mockReturnValueOnce(makeSelectChain(old as never))
      .mockReturnValueOnce(makeSelectChain([row("QUERY_MAX_CONCURRENT", 40)]));
    const slow = refreshSettings();
    await refreshSettings();
    expect(getSetting("QUERY_MAX_CONCURRENT")).toBe(40);
    releaseOld([]);
    await slow;
    expect(getSetting("QUERY_MAX_CONCURRENT")).toBe(40);
  });
});

describe("refresh ordering across module copies (#1888)", () => {
  it("an older refresh from one copy does not overwrite a newer one from another", async () => {
    let releaseOld!: (rows: unknown[]) => void;
    const old = new Promise<unknown[]>((r) => (releaseOld = r));
    mockDb.select
      .mockReturnValueOnce(makeSelectChain(old as never))
      .mockReturnValueOnce(makeSelectChain([row("QUERY_MAX_CONCURRENT", 40)]));
    const slow = refreshSettings();
    vi.resetModules();
    const copy2 = await import("../store");
    await copy2.refreshSettings();
    releaseOld([]);
    await slow;
    expect(getSetting("QUERY_MAX_CONCURRENT")).toBe(40);
  });
});

describe("startSettingsRefresh", () => {
  it("resolves after the first load, and a failed load reports and does not throw", async () => {
    const onError = vi.fn();
    mockDb.select.mockReturnValueOnce(
      makeSelectChain(Promise.reject(new Error("db down")) as never),
    );
    await startSettingsRefresh(onError);
    expect(onError).toHaveBeenCalledTimes(1);
    const { state } = await import("../core");
    clearInterval(state.timer);
    state.timer = undefined;
  });
});

/** A transaction whose first read (the tenant's rows) is `stored`. */
function tx(stored: unknown[]) {
  const t = {
    execute: vi.fn(() => Promise.resolve()),
    select: vi.fn(() => makeSelectChain(stored)),
    insert: vi.fn(() => ({
      values: () => ({ onConflictDoUpdate: () => Promise.resolve() }),
    })),
    delete: vi.fn((..._a: unknown[]) => ({
      where: (..._w: unknown[]) => Promise.resolve(),
    })),
  };
  mockDb.transaction.mockImplementation(
    async (fn: (t: unknown) => Promise<unknown>) => fn(t),
  );
  mockDb.select.mockReturnValue(makeSelectChain([]));
  return t;
}

describe("recovery after a failed first load", () => {
  it("a later tick applies the rows once the database is back", async () => {
    vi.useFakeTimers();
    const { state } = await import("../core");
    const onError = vi.fn();
    mockDb.select
      .mockReturnValueOnce(
        makeSelectChain(Promise.reject(new Error("db down")) as never),
      )
      .mockReturnValueOnce(makeSelectChain([row("LOG_LEVEL", "debug")]));
    await startSettingsRefresh(onError);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(getSetting("LOG_LEVEL")).toBe("info");
    await vi.advanceTimersByTimeAsync(SETTINGS_TTL_MS);
    expect(getSetting("LOG_LEVEL")).toBe("debug");
    clearInterval(state.timer);
    state.timer = undefined;
    vi.useRealTimers();
  });
});

describe("saveSettings", () => {
  it("takes the tenant's lock first, writes, and refreshes the cache", async () => {
    const t = tx([]);
    mockDb.select.mockReturnValueOnce(
      makeSelectChain([row("QUERY_MAX_CONCURRENT", 40)]),
    );
    await saveSettings("t-1", "u1", { QUERY_MAX_CONCURRENT: 40 });
    expect(t.execute).toHaveBeenCalledTimes(1);
    expect(t.execute.mock.invocationCallOrder[0]).toBeLessThan(
      t.insert.mock.invocationCallOrder[0],
    );
    expect(getSetting("QUERY_MAX_CONCURRENT")).toBe(40);
  });

  it("reports old and new from this transaction, not the shared cache", async () => {
    tx([row("LOG_LEVEL", "error")]);
    // Another save landed in the cache meanwhile; it must not leak into this audit.
    applySettingRows([row("LOG_LEVEL", "trace")]);
    const changed = await saveSettings("t-1", "u1", { LOG_LEVEL: "debug" });
    expect(changed).toEqual([{ key: "LOG_LEVEL", old: "error", new: "debug" }]);
  });

  it("a reset deletes the row, scoped to the tenant, and reports the fallback", async () => {
    const t = tx([row("LOG_LEVEL", "debug")]);
    const whereArgs: unknown[] = [];
    t.delete.mockImplementation(() => ({
      where: (e: unknown) => {
        whereArgs.push(e);
        return Promise.resolve();
      },
    }));
    const changed = await saveSettings("t-1", "u1", { LOG_LEVEL: null });
    expect(sqlValues(whereArgs[0])).toEqual(["t-1", "LOG_LEVEL"]);
    expect(changed).toEqual([{ key: "LOG_LEVEL", old: "debug", new: "info" }]);
  });

  it("a key written with its current value, and a reset of a key with no row, are still reported", async () => {
    tx([row("QUERY_MAX_CONCURRENT", 10)]);
    const changed = await saveSettings("t-1", "u1", {
      QUERY_MAX_CONCURRENT: 10,
      LOG_LEVEL: null,
    });
    expect(changed.map((c) => c.key)).toEqual([
      "QUERY_MAX_CONCURRENT",
      "LOG_LEVEL",
    ]);
  });

  it("refuses a pair that is only valid against a stale cache, and writes nothing", async () => {
    // Another save already set concurrent to 6; the cache still says 10.
    const t = tx([row("QUERY_MAX_CONCURRENT", 6)]);
    await expect(
      saveSettings("t-1", "u1", { QUERY_MAX_PER_USER: 8 }),
    ).rejects.toBeInstanceOf(SettingsValidationError);
    expect(t.insert).not.toHaveBeenCalled();
  });

  it("refuses another tenant before touching the database", async () => {
    await expect(
      saveSettings("t-2", "u1", { LOG_LEVEL: "debug" }),
    ).rejects.toThrow("Forbidden");
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });
});
