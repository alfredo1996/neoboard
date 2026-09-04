import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Every runtime dependency of this package must actually be imported by it.
 *
 * A dependency nobody imports still ships: `echarts-countries-js` sat here
 * unused at 36 MB, declaring ISC in its package.json while its own LICENSE.md
 * read ODbL — a licence question the repo never needed to answer, for code it
 * never ran (#1546 shipped from the same blind spot: nothing linted or checked
 * this package).
 *
 * The matcher deliberately understands `await import("dep")` as well as static
 * imports: `@codemirror/lang-sql` and `@codemirror/theme-one-dark` are loaded
 * only through dynamic imports, and a static-only check would call two
 * load-bearing packages dead.
 */

const PKG_ROOT = join(__dirname, "..", "..");

/** Dependencies that are legitimately never imported by this package's source. */
const ALLOWLIST: Record<string, string> = {
  "react-dom":
    "React's runtime peer — the consumer's app renders these components; the library never imports it itself.",
};

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__") continue;
      sourceFiles(full, acc);
    } else if (
      /\.(ts|tsx)$/.test(entry) &&
      !entry.includes(".test.") &&
      !entry.includes(".stories.")
    ) {
      acc.push(full);
    }
  }
  return acc;
}

const SOURCES = sourceFiles(join(PKG_ROOT, "src")).map((f) =>
  readFileSync(f, "utf8"),
);

function isImported(dep: string): boolean {
  // Static, side-effect, dynamic and require forms, for the package itself and
  // any subpath export.
  const d = dep.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(from\\s+["']${d}(/[^"']*)?["'])|(import\\s+["']${d}(/[^"']*)?["'])` +
      `|(import\\(\\s*["']${d}(/[^"']*)?["'])|(require\\(\\s*["']${d}(/[^"']*)?["'])`,
  );
  return SOURCES.some((src) => pattern.test(src));
}

describe("component runtime dependencies", () => {
  const pkg = JSON.parse(
    readFileSync(join(PKG_ROOT, "package.json"), "utf8"),
  ) as { dependencies?: Record<string, string> };
  const deps = Object.keys(pkg.dependencies ?? {});

  it("finds dependencies to check", () => {
    expect(deps.length).toBeGreaterThan(10);
  });

  it("reads its own source files", () => {
    // Guards the scan: if the glob broke, every dependency would look unused
    // and the allowlist would swallow the failure.
    expect(SOURCES.length).toBeGreaterThan(50);
  });

  it("recognises a dynamically imported dependency as used", () => {
    // language-resolvers.ts loads this only via `await import(...)`.
    expect(isImported("@codemirror/lang-sql")).toBe(true);
  });

  it.each(Object.keys(ALLOWLIST).map((dep) => [dep, ALLOWLIST[dep]] as const))(
    "allowlisted %s carries a reason",
    (_dep, reason) => {
      expect(reason.length).toBeGreaterThan(20);
    },
  );

  it("every runtime dependency is imported somewhere in src/", () => {
    const unused = deps.filter((d) => !(d in ALLOWLIST) && !isImported(d));
    expect(unused).toEqual([]);
  });

  it("ships no @types/* as a runtime dependency", () => {
    // Type packages belong in devDependencies; they are erased at build time.
    expect(deps.filter((d) => d.startsWith("@types/"))).toEqual([]);
  });
});
