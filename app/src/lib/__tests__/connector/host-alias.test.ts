import { describe, it, expect, vi, beforeEach } from "vitest";

const mockLookup = vi.fn();
vi.mock("node:dns/promises", () => ({ lookup: (h: string) => mockLookup(h) }));

import {
  hostAliasResolves,
  _resetHostAliasCache,
} from "@/lib/connector/host-alias";

beforeEach(() => {
  vi.clearAllMocks();
  _resetHostAliasCache();
});

describe("hostAliasResolves (#1348)", () => {
  it("is true when the alias resolves", async () => {
    mockLookup.mockResolvedValue({ address: "192.168.65.2", family: 4 });
    await expect(hostAliasResolves()).resolves.toBe(true);
    expect(mockLookup).toHaveBeenCalledWith("host.docker.internal");
  });

  it("is false when it does not, rather than rejecting", async () => {
    // Linux without --expose-host. This sits on the connection path; a
    // rejection here would turn a connection failure into a 500.
    mockLookup.mockRejectedValue(
      Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" }),
    );
    await expect(hostAliasResolves()).resolves.toBe(false);
  });

  it("probes once, even under concurrent callers", async () => {
    // Cached as a PROMISE, not a boolean: caching the resolved value would
    // still fire N lookups for N connections opened before the first settles.
    mockLookup.mockResolvedValue({ address: "1.2.3.4", family: 4 });
    await Promise.all([
      hostAliasResolves(),
      hostAliasResolves(),
      hostAliasResolves(),
    ]);
    expect(mockLookup).toHaveBeenCalledTimes(1);
  });

  it("caches a negative answer as firmly as a positive one", async () => {
    mockLookup.mockRejectedValue(new Error("nope"));
    await hostAliasResolves();
    await hostAliasResolves();
    expect(mockLookup).toHaveBeenCalledTimes(1);
  });
});
