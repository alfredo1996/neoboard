import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  cachedIntrospection,
  forgetIntrospections,
  SCHEMA_CACHE_MAX_ENTRIES,
  SCHEMA_CACHE_TTL_MS,
  resetSchemaCacheForTests,
} from "@/lib/connector/schema-cache";

const scope = { tenantId: "t1", connectionId: "c1", configEncrypted: "enc-a" };
const other = (connectionId: string) => ({ ...scope, connectionId });

beforeEach(() => {
  vi.useRealTimers();
  resetSchemaCacheForTests();
});

describe("cachedIntrospection", () => {
  it("answers a second read from the cache", async () => {
    const load = vi.fn().mockResolvedValue("a");
    await cachedIntrospection(scope, load);
    expect(await cachedIntrospection(scope, load)).toBe("a");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("shares one introspection between concurrent misses", async () => {
    let release!: (v: string) => void;
    const load = vi.fn(
      () => new Promise<string>((resolve) => (release = resolve)),
    );
    const a = cachedIntrospection(scope, load);
    const b = cachedIntrospection(scope, load);
    release("x");
    expect(await Promise.all([a, b])).toEqual(["x", "x"]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("refresh reads again and replaces the entry", async () => {
    const load = vi.fn().mockResolvedValueOnce("old").mockResolvedValue("new");
    await cachedIntrospection(scope, load);
    expect(await cachedIntrospection(scope, load, { refresh: true })).toBe(
      "new",
    );
    expect(await cachedIntrospection(scope, load)).toBe("new");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("joins a refresh to a read already in flight (#2534)", async () => {
    let release!: (v: string) => void;
    const load = vi.fn(
      () => new Promise<string>((resolve) => (release = resolve)),
    );
    const first = cachedIntrospection(scope, load, { refresh: true });
    const second = cachedIntrospection(scope, load, { refresh: true });
    release("x");
    expect(await Promise.all([first, second])).toEqual(["x", "x"]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("keeps the last good read when a refresh fails (#2534)", async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce("good")
      .mockRejectedValueOnce(new Error("down"));
    await cachedIntrospection(scope, load);
    await expect(
      cachedIntrospection(scope, load, { refresh: true }),
    ).rejects.toThrow("down");
    expect(await cachedIntrospection(scope, load)).toBe("good");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not store a read that finishes after its connection was forgotten (#2534)", async () => {
    let release!: (v: string) => void;
    const slow = vi.fn(
      () => new Promise<string>((resolve) => (release = resolve)),
    );
    const pending = cachedIntrospection(scope, slow);
    forgetIntrospections("t1", "c1");
    release("stale");
    await pending;
    const fresh = vi.fn().mockResolvedValue("fresh");
    expect(await cachedIntrospection(scope, fresh)).toBe("fresh");
  });

  it("forgets a connection's entries on update or delete, and only its own", async () => {
    const load = vi.fn().mockResolvedValue("v");
    await cachedIntrospection(scope, load);
    await cachedIntrospection(other("c2"), load);
    forgetIntrospections("t1", "c1");
    await cachedIntrospection(scope, load);
    await cachedIntrospection(other("c2"), load);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("misses when the stored config changed", async () => {
    const load = vi.fn().mockResolvedValue("v");
    await cachedIntrospection(scope, load);
    await cachedIntrospection({ ...scope, configEncrypted: "enc-b" }, load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("never shares an entry between two tenants with one connection id", async () => {
    const load = vi.fn().mockResolvedValue("v");
    await cachedIntrospection(scope, load);
    await cachedIntrospection({ ...scope, tenantId: "t2" }, load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not keep a failure", async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValue("ok");
    await expect(cachedIntrospection(scope, load)).rejects.toThrow("down");
    expect(await cachedIntrospection(scope, load)).toBe("ok");
  });

  it("reads again once the TTL has passed", async () => {
    vi.useFakeTimers();
    const load = vi.fn().mockResolvedValue("v");
    await cachedIntrospection(scope, load);
    vi.advanceTimersByTime(SCHEMA_CACHE_TTL_MS + 1);
    await cachedIntrospection(scope, load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("holds at most the bound, dropping the least recently used", async () => {
    const load = vi.fn().mockResolvedValue("v");
    for (let i = 0; i < SCHEMA_CACHE_MAX_ENTRIES; i++) {
      await cachedIntrospection(other(`c${i}`), load);
    }
    // c0 is the oldest, but a hit makes it the most recently used.
    await cachedIntrospection(other("c0"), load);
    await cachedIntrospection(other("extra"), load);
    load.mockClear();
    await cachedIntrospection(other("c0"), load);
    expect(load).not.toHaveBeenCalled(); // kept: it was used last
    await cachedIntrospection(other("c1"), load);
    expect(load).toHaveBeenCalledTimes(1); // c1 was the least recently used
  });
});
