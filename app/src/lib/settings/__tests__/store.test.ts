import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSelectChain, sqlValues } from "@/__tests__/helpers/drizzle-mocks";
import { applySettingRows, getSetting } from "../core";

const mockDb = { select: vi.fn(), transaction: vi.fn() };
vi.mock("@/lib/db", () => ({ db: mockDb }));

const { refreshSettings, saveSettings, startSettingsRefresh } =
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
  applySettingRows([]);
});

describe("refreshSettings", () => {
  it("reads only the tenant's rows and makes them the cache", async () => {
    const chain = makeSelectChain([row("QUERY_MAX_CONCURRENT", 33)]);
    mockDb.select.mockReturnValueOnce(chain);
    await refreshSettings("t-1");
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
    const slow = refreshSettings("t-1");
    await refreshSettings("t-1");
    expect(getSetting("QUERY_MAX_CONCURRENT")).toBe(40);
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

describe("saveSettings", () => {
  it("reports a key written with its current value, and a reset of a key that had no row", async () => {
    const insert = vi.fn(() => ({
      values: () => ({ onConflictDoUpdate: () => Promise.resolve() }),
    }));
    const del = vi.fn(() => ({ where: () => Promise.resolve() }));
    mockDb.transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => fn({ insert, delete: del }),
    );
    mockDb.select.mockReturnValueOnce(
      makeSelectChain([row("QUERY_MAX_CONCURRENT", 10)]),
    );
    const changed = await saveSettings("t-1", "u1", {
      QUERY_MAX_CONCURRENT: 10,
      LOG_LEVEL: null,
    });
    expect(changed.map((c) => c.key)).toEqual([
      "QUERY_MAX_CONCURRENT",
      "LOG_LEVEL",
    ]);
  });

  it("writes in a transaction, applies at once, and reports the effective change", async () => {
    const insert = vi.fn(() => ({
      values: () => ({ onConflictDoUpdate: () => Promise.resolve() }),
    }));
    mockDb.transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => fn({ insert }),
    );
    mockDb.select.mockReturnValueOnce(
      makeSelectChain([row("QUERY_MAX_CONCURRENT", 40)]),
    );

    const changed = await saveSettings("t-1", "u1", {
      QUERY_MAX_CONCURRENT: 40,
    });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(getSetting("QUERY_MAX_CONCURRENT")).toBe(40);
    expect(changed).toEqual([
      { key: "QUERY_MAX_CONCURRENT", old: 10, new: 40 },
    ]);
  });

  it("a reset deletes the row, scoped to the tenant, and falls back", async () => {
    applySettingRows([row("LOG_LEVEL", "debug")]);
    const whereArgs: unknown[] = [];
    const del = vi.fn(() => ({
      where: (e: unknown) => {
        whereArgs.push(e);
        return Promise.resolve();
      },
    }));
    mockDb.transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => fn({ delete: del }),
    );
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));

    const changed = await saveSettings("t-1", "u1", { LOG_LEVEL: null });

    expect(sqlValues(whereArgs[0])).toEqual(["t-1", "LOG_LEVEL"]);
    expect(changed).toEqual([{ key: "LOG_LEVEL", old: "debug", new: "info" }]);
  });
});
