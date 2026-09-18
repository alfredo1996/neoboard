import { describe, it, expect, afterEach, vi } from "vitest";
import { randomId } from "../random-id";

const V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * #1886 — `crypto.randomUUID` only exists in a secure context. Plain HTTP on
 * anything but localhost (a LAN IP, 0.0.0.0) is not one, and there a
 * module-scope call crashed every page that imported the dashboard store.
 */
describe("randomId", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns distinct v4 UUIDs", () => {
    const ids = new Set(Array.from({ length: 200 }, randomId));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(V4);
  });

  it("still returns distinct v4 UUIDs where crypto.randomUUID does not exist", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: crypto.getRandomValues.bind(crypto),
    });
    expect("randomUUID" in crypto).toBe(false);

    const ids = new Set(Array.from({ length: 200 }, randomId));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(V4);
  });
});

describe("dashboard store on an insecure origin (#1886)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("can be imported, and starts with one page that has an id", async () => {
    vi.stubGlobal("crypto", {
      getRandomValues: crypto.getRandomValues.bind(crypto),
    });
    vi.resetModules();

    const { useDashboardStore } = await import("@/stores/dashboard-store");

    const { pages } = useDashboardStore.getState().layout;
    expect(pages).toHaveLength(1);
    expect(pages[0].id).toMatch(V4);
  });
});

/**
 * Ratchet: the crash came back through whichever file next reached for
 * `crypto.randomUUID()` in code the browser runs. Server-only files are
 * listed; anything else goes through `randomId()`.
 */
describe("no client-side crypto.randomUUID (#1886)", () => {
  const SERVER_ONLY = new Set([
    "lib/random-id.ts",
    "lib/db/schema.ts",
    "lib/query/middleware/scheduler.ts",
    "proxy.ts",
  ]);

  it("is only called from server-only files", async () => {
    const { globSync, readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const src = path.resolve(__dirname, "../..");

    const files = globSync("**/*.{ts,tsx}", { cwd: src });
    // Not vacuous: a wrong `src` would glob nothing and pass.
    expect(files).toContain("lib/db/schema.ts");

    const offenders = files
      .filter((f) => !f.includes("__tests__") && !SERVER_ONLY.has(f))
      .filter((f) =>
        readFileSync(path.join(src, f), "utf8").includes("crypto.randomUUID"),
      );

    expect(offenders).toEqual([]);
  });
});
