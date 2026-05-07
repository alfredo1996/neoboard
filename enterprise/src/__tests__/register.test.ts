import { describe, it, expect, vi } from "vitest";
import { register } from "../register";
import type { Extensions } from "../register";

describe("@neoboard/enterprise register", () => {
  it("exposes a callable register function", () => {
    expect(typeof register).toBe("function");
  });

  it("is a no-op when called with an empty extensions object", () => {
    const extensions: Extensions = {};
    expect(() => register(extensions)).not.toThrow();
    expect(Object.keys(extensions)).toHaveLength(0);
  });

  it("does not throw on a realistic extensions shape", () => {
    // Mirror the core's extensions singleton shape. Real implementations
    // will register handlers into these arrays.
    const extensions: Extensions = {
      authProviders: { register: vi.fn(), getAll: () => [] },
      permissionCheckers: { register: vi.fn(), getAll: () => [] },
      resourceFilters: { register: vi.fn(), getAll: () => [] },
      roleProviders: { register: vi.fn(), getAll: () => [] },
      queryMiddleware: { register: vi.fn(), getAll: () => [] },
    };
    expect(() => register(extensions)).not.toThrow();
  });
});
