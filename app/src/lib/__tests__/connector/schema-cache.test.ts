import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  cachedIntrospection,
  forgetIntrospections,
  SCHEMA_CACHE_MAX_ENTRIES,
  SCHEMA_CACHE_TTL_MS,
  resetSchemaCacheForTests,
} from "@/lib/connector/schema-cache";

const scope = { tenantId: "t1", connectionId: "c1" };
const cfg = { uri: "bolt://x", password: "p" };
const other = (connectionId: string) => ({ ...scope, connectionId });

beforeEach(() => {
  vi.useRealTimers();
  resetSchemaCacheForTests();
});

describe("cachedIntrospection", () => {
  it("answers a second read from the cache", async () => {
    const load = vi.fn().mockResolvedValue("a");
    await cachedIntrospection(scope, cfg, "schema", load);
    expect(await cachedIntrospection(scope, cfg, "schema", load)).toBe("a");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("shares one introspection between concurrent misses", async () => {
    let release!: (v: string) => void;
    const load = vi.fn(
      () => new Promise<string>((resolve) => (release = resolve)),
    );
    const a = cachedIntrospection(scope, cfg, "schema", load);
    const b = cachedIntrospection(scope, cfg, "schema", load);
    release("x");
    expect(await Promise.all([a, b])).toEqual(["x", "x"]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("refresh reads again and replaces the entry", async () => {
    const load = vi.fn().mockResolvedValueOnce("old").mockResolvedValue("new");
    await cachedIntrospection(scope, cfg, "schema", load);
    expect(
      await cachedIntrospection(scope, cfg, "schema", load, { refresh: true }),
    ).toBe("new");
    expect(await cachedIntrospection(scope, cfg, "schema", load)).toBe("new");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("forgets a connection's entries on update or delete, and only its own", async () => {
    const load = vi.fn().mockResolvedValue("v");
    await cachedIntrospection(scope, cfg, "schema", load);
    await cachedIntrospection(scope, cfg, "terms", load);
    await cachedIntrospection(other("c2"), cfg, "schema", load);
    forgetIntrospections("t1", "c1");
    await cachedIntrospection(scope, cfg, "schema", load);
    await cachedIntrospection(scope, cfg, "terms", load);
    await cachedIntrospection(other("c2"), cfg, "schema", load);
    expect(load).toHaveBeenCalledTimes(5);
  });

  it("misses when the connection's config changed", async () => {
    const load = vi.fn().mockResolvedValue("v");
    await cachedIntrospection(scope, cfg, "schema", load);
    await cachedIntrospection(scope, { ...cfg, password: "q" }, "schema", load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("never shares an entry between two tenants with one connection id", async () => {
    const load = vi.fn().mockResolvedValue("v");
    await cachedIntrospection(scope, cfg, "schema", load);
    await cachedIntrospection(
      { ...scope, tenantId: "t2" },
      cfg,
      "schema",
      load,
    );
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not keep a failure", async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValue("ok");
    await expect(
      cachedIntrospection(scope, cfg, "schema", load),
    ).rejects.toThrow("down");
    expect(await cachedIntrospection(scope, cfg, "schema", load)).toBe("ok");
  });

  it("reads again once the TTL has passed", async () => {
    vi.useFakeTimers();
    const load = vi.fn().mockResolvedValue("v");
    await cachedIntrospection(scope, cfg, "schema", load);
    vi.advanceTimersByTime(SCHEMA_CACHE_TTL_MS + 1);
    await cachedIntrospection(scope, cfg, "schema", load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("holds at most the bound, dropping the oldest", async () => {
    const load = vi.fn().mockResolvedValue("v");
    for (let i = 0; i <= SCHEMA_CACHE_MAX_ENTRIES; i++) {
      await cachedIntrospection(other(`c${i}`), cfg, "schema", load);
    }
    load.mockClear();
    await cachedIntrospection(other("c0"), cfg, "schema", load);
    expect(load).toHaveBeenCalledTimes(1); // the first one was evicted
    await cachedIntrospection(
      other(`c${SCHEMA_CACHE_MAX_ENTRIES}`),
      cfg,
      "schema",
      load,
    );
    expect(load).toHaveBeenCalledTimes(1); // the newest is still held
  });
});
