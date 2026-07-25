import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import SPEC from "@/lib/api/openapi-spec";

/**
 * Drift guard for the hand-maintained OpenAPI spec (#1236).
 *
 * `openapi-spec.ts` is written by hand and served at /api/openapi.json, so
 * nothing fails when a route is added, changed, or deleted without touching
 * it. These tests make that failure loud.
 *
 * This is a **ratchet**, not a clean slate: the spec predates the guard and
 * does not cover every route. Existing gaps are listed in UNDOCUMENTED_DEBT
 * below so they are visible and reviewable; new routes must either be
 * documented or added to a list, and either way it shows up in the diff.
 */

const APP_SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const API_DIR = resolve(APP_SRC, "app/api");

const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
] as const;

/**
 * Endpoints intentionally absent from the public spec.
 * These are framework/meta plumbing, not part of the documented API.
 */
const INTERNAL_ROUTES = new Set<string>([
  "/api/auth/{...nextauth}", // Auth.js mounts its own handler
  "/api/docs", // Swagger UI HTML, not an API operation
  "/api/openapi", // serves the spec
  "/api/openapi.json", // serves the spec
]);

/**
 * Routes that SHOULD be documented but are not yet — the burn-down list.
 * Remove an entry when you add its spec coverage. Do not add to this list
 * for a brand-new route: document it instead.
 */
const UNDOCUMENTED_DEBT = new Set<string>([
  "/api/admin/rotate-key",
  "/api/audit-logs",
  "/api/auth/bootstrap-status",
  "/api/auth/sso-providers",
  "/api/connections/list-databases-inline",
  "/api/connections/{id}/databases",
  "/api/connections/{id}/reassign",
  "/api/connections/{id}/usage",
  "/api/features",
  "/api/health",
  "/api/sso-providers",
  "/api/users/me",
  "/api/users/me/password",
  "/api/users/{id}/reset-password",
]);

/** Recursively collect every route.ts under app/api. */
function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return entry.name === "route.ts" ? [full] : [];
  });
}

/** app/api/connections/[id]/route.ts -> /api/connections/{id} */
function toApiPath(file: string): string {
  const segments = relative(API_DIR, dirname(file)).split(sep).filter(Boolean);
  const mapped = segments.map((s) =>
    s.startsWith("[") && s.endsWith("]")
      ? `{${s.slice(1, -1).replace(/^\.\.\./, "...")}}`
      : s,
  );
  return ["/api", ...mapped].join("/").replace("//", "/");
}

/** Exported HTTP handlers, read from the source rather than by importing. */
function exportedMethods(file: string): string[] {
  const src = readFileSync(file, "utf8");
  return HTTP_METHODS.filter((m) =>
    new RegExp(`export\\s+(async\\s+)?function\\s+${m}\\b`).test(src),
  );
}

const routes = routeFiles(API_DIR).map((file) => ({
  file,
  path: toApiPath(file),
  methods: exportedMethods(file),
}));

const specPaths = SPEC.paths as Record<string, Record<string, unknown>>;

describe("OpenAPI spec drift", () => {
  it("finds the route files at all (guards the guard)", () => {
    // If the derivation breaks, every other assertion here passes vacuously.
    expect(routes.length).toBeGreaterThan(20);
    expect(routes.some((r) => r.path === "/api/connections")).toBe(true);
    expect(routes.some((r) => r.path === "/api/connections/{id}")).toBe(true);
  });

  it("documents every route, or lists it as internal/debt", () => {
    const undocumented = routes
      .filter(
        (r) =>
          r.methods.length > 0 &&
          !(r.path in specPaths) &&
          !INTERNAL_ROUTES.has(r.path) &&
          !UNDOCUMENTED_DEBT.has(r.path),
      )
      .map((r) => r.path);

    expect(
      undocumented,
      "New routes must be added to openapi-spec.ts (preferred) or, if genuinely internal, to INTERNAL_ROUTES",
    ).toEqual([]);
  });

  it("documents every method of an already-documented route", () => {
    const missing: string[] = [];
    for (const r of routes) {
      const entry = specPaths[r.path];
      if (!entry) continue;
      for (const m of r.methods) {
        if (!(m.toLowerCase() in entry)) missing.push(`${m} ${r.path}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("has no spec paths pointing at routes that no longer exist", () => {
    const real = new Set(routes.map((r) => r.path));
    const stale = Object.keys(specPaths).filter((p) => !real.has(p));
    expect(stale, "Delete these from openapi-spec.ts").toEqual([]);
  });

  it("keeps the opt-out lists honest", () => {
    const real = new Set(routes.map((r) => r.path));
    // A stale entry silently weakens the guard, so fail on it.
    const goneInternal = [...INTERNAL_ROUTES].filter((p) => !real.has(p));
    const goneDebt = [...UNDOCUMENTED_DEBT].filter((p) => !real.has(p));
    expect(goneInternal, "Remove from INTERNAL_ROUTES").toEqual([]);
    expect(goneDebt, "Remove from UNDOCUMENTED_DEBT").toEqual([]);
    // Anything now documented should leave the debt list.
    const nowDocumented = [...UNDOCUMENTED_DEBT].filter((p) => p in specPaths);
    expect(nowDocumented, "Documented — remove from UNDOCUMENTED_DEBT").toEqual(
      [],
    );
  });

  it("actually catches an undocumented route (proves the guard works)", () => {
    // Same predicate as the real assertion, run against a fabricated route.
    const fabricated = {
      path: "/api/definitely-not-documented",
      methods: ["GET"],
    };
    const wouldFlag =
      fabricated.methods.length > 0 &&
      !(fabricated.path in specPaths) &&
      !INTERNAL_ROUTES.has(fabricated.path) &&
      !UNDOCUMENTED_DEBT.has(fabricated.path);
    expect(wouldFlag).toBe(true);
  });
});
