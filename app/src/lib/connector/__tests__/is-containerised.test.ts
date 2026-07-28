import { describe, it, expect, vi, beforeEach } from "vitest";

const mockExistsSync = vi.fn();
vi.mock("node:fs", () => ({ existsSync: (p: string) => mockExistsSync(p) }));

import { isContainerised, _resetContainerisedCache } from "../is-containerised";

beforeEach(() => {
  vi.clearAllMocks();
  _resetContainerisedCache();
});

describe("isContainerised (#1346)", () => {
  it("reports true when /.dockerenv exists", () => {
    mockExistsSync.mockReturnValue(true);
    expect(isContainerised()).toBe(true);
    expect(mockExistsSync).toHaveBeenCalledWith("/.dockerenv");
  });

  it("reports false on a host install", () => {
    // The case that keeps the hint honest: a local-mode user pointing at
    // localhost is correct, and must not be told to use a Docker hostname.
    mockExistsSync.mockReturnValue(false);
    expect(isContainerised()).toBe(false);
  });

  it("checks the filesystem only once", () => {
    // Called from an error path; the answer cannot change while the process
    // runs, so a stat per failed connection test would be pure waste.
    mockExistsSync.mockReturnValue(true);
    isContainerised();
    isContainerised();
    isContainerised();
    expect(mockExistsSync).toHaveBeenCalledTimes(1);
  });

  it("caches false as firmly as true", () => {
    // `cached ??= …` treats a cached false as unset if written naively.
    mockExistsSync.mockReturnValue(false);
    expect(isContainerised()).toBe(false);
    expect(isContainerised()).toBe(false);
    expect(mockExistsSync).toHaveBeenCalledTimes(1);
  });
});
