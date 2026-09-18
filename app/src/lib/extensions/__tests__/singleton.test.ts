import { describe, it, expect, vi } from "vitest";

/**
 * #1888 — Next.js compiles instrumentation.ts and every route handler into
 * separate bundles, each with its own copy of this module. The middleware
 * registered at boot landed in instrumentation's copy; the query routes read
 * their own, empty one, so in a production build the scheduler and the audit
 * log never ran. `vi.resetModules()` reproduces a second bundle's fresh copy.
 */
describe("extensions registry — one per process", () => {
  it("hands every copy of the module the same registry", async () => {
    const first = (await import("../index")).extensions;
    first.queryMiddleware.register({
      id: "test:singleton",
      middleware: (_ctx, next) => next(),
    });

    vi.resetModules();
    const second = (await import("../index")).extensions;

    expect(second.queryMiddleware.getAll().map((m) => m.id)).toContain(
      "test:singleton",
    );
    second.queryMiddleware.clear();
  });
});
