import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * #1963. A route that parses its body with `request.json()` inside a try that
 * ends in handleRouteError answers a malformed body with 500 — the caller's
 * mistake, logged as a server error. `readJsonBody` answers it 400. This fails
 * when a route parses a request body directly.
 */
const API_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../app/api",
);

/** Routes that catch a bad body themselves and already answer 400. */
const HANDLES_ITS_OWN = new Set([
  "users/me/route.ts",
  "users/me/password/route.ts",
]);

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : routeFiles(path);
    }
    return entry.name === "route.ts" ? [path] : [];
  });
}

describe("request bodies are read with readJsonBody (#1963)", () => {
  it("no route parses a request body directly", () => {
    const offenders = routeFiles(API_DIR)
      .map((file) => relative(API_DIR, file))
      .filter((file) => !HANDLES_ITS_OWN.has(file))
      .filter((file) =>
        /\b(?:request|req)\.json\(\)/.test(
          readFileSync(join(API_DIR, file), "utf8"),
        ),
      );
    expect(offenders).toEqual([]);
  });

  it("still finds the routes it allowlists", () => {
    // A rename would otherwise leave the allowlist vouching for nothing.
    const found = new Set(routeFiles(API_DIR).map((f) => relative(API_DIR, f)));
    for (const file of HANDLES_ITS_OWN) expect(found.has(file)).toBe(true);
  });
});
