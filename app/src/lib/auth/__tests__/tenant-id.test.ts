import { describe, it, expect, afterEach, vi } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { isTenantIdSet, resolveTenantId } from "../tenant-id";

// #1728: the prod compose files passed `TENANT_ID: ${TENANT_ID:-}`, and every
// resolver's `process.env.TENANT_ID ?? "default"` kept the "" they got. One
// helper now owns the rule, and nothing else may read the variable.

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveTenantId (#1728)", () => {
  it.each([
    [undefined, "default", false],
    ["", "default", false],
    ["   ", "default", false],
    ["default", "default", true],
    ["acme", "acme", true],
    // A non-blank value is used as given, so no existing tenant changes.
    [" acme ", " acme ", true],
  ])("TENANT_ID=%j resolves %j (set: %s)", (value, tenant, set) => {
    vi.stubEnv("TENANT_ID", value);
    expect(resolveTenantId()).toBe(tenant);
    expect(isTenantIdSet()).toBe(set);
  });
});

// ─── Guard: nothing reads TENANT_ID except the helper ───────────────────────

const REPO = join(__dirname, "..", "..", "..", "..", "..");
const HELPER = join("app", "src", "lib", "auth", "tenant-id.ts");
const ROOTS = ["app/src", "app/e2e", "cli/src", "cli/scripts", "scripts"];
const SKIP_DIRS = new Set(["node_modules", "__tests__", ".next", "dist", "coverage"]);
const SOURCE = /\.(?:[cm]?js|tsx?)$/;
const DIRECT_READ =
  /process\.env(?:\.TENANT_ID\b|\[\s*["'`]TENANT_ID["'`]\s*\])|\{[^}]*\bTENANT_ID\b[^}]*\}\s*=\s*process\.env/;

function sources(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return SKIP_DIRS.has(e.name) ? [] : sources(path);
    return SOURCE.test(e.name) && !/\.test\./.test(e.name) ? [path] : [];
  });
}

describe("TENANT_ID read guard (#1728)", () => {
  it("recognises the ways a direct read is written", () => {
    expect(
      [
        'const t = process.env.TENANT_ID ?? "default";',
        "const t = process.env['TENANT_ID'];",
        "const { TENANT_ID } = process.env;",
        'resolveTenantId(); env({ TENANT_ID: "" });',
      ].map((src) => DIRECT_READ.test(src)),
    ).toEqual([true, true, true, false]);
  });

  it("finds no read of process.env.TENANT_ID outside resolveTenantId", () => {
    const files = ROOTS.flatMap((root) => sources(join(REPO, root)));
    expect(files.length).toBeGreaterThan(100);
    const offenders = files
      .map((f) => relative(REPO, f))
      .filter((f) => f !== HELPER)
      .filter((f) => DIRECT_READ.test(readFileSync(join(REPO, f), "utf8")));
    expect(offenders).toEqual([]);
  });
});
