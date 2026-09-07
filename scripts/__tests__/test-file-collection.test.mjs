import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * #1633 — every test file on disk is collected by exactly one runner.
 *
 * Four packages use four different rules for what counts as a test. cli's used
 * to be `src/__tests__` — one root directory only. A developer following
 * CLAUDE.md ("tests live in a __tests__ directory next to the file under
 * test") wrote `src/lib/__tests__/x.test.ts`, saw the suite pass, and shipped
 * a test that never ran and never said so.
 *
 * This is the guard against that happening again, in any package: a file that
 * looks like a test and is collected by nothing fails the build.
 */

const ROOT = new URL("../..", import.meta.url).pathname.replace(/[/]$/, "");

/** Every file under `dir` matching `re`, recursively, repo-relative. */
function walk(dir, re, out = []) {
  let entries;
  try {
    entries = readdirSync(join(ROOT, dir));
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === "dist" || entry === "coverage") {
      continue;
    }
    const rel = `${dir}/${entry}`;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, re, out);
    else if (re.test(rel)) out.push(rel);
  }
  return out;
}

/** Minimal glob to RegExp: handles the double-star, star and brace forms. */
function globToRe(glob) {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      i++;
      if (glob[i + 1] === "/") {
        i++;
        out += "(?:[^/]*/)*";
      } else {
        out += ".*";
      }
    } else if (c === "*") {
      out += "[^/]*";
    } else if (c === "{") {
      const close = glob.indexOf("}", i);
      out += "(" + glob.slice(i + 1, close).split(",").join("|") + ")";
      i = close;
    } else if (".+^$()|[]".includes(c)) {
      out += "\\" + c;
    } else {
      out += c;
    }
  }
  return new RegExp("^" + out + "$");
}

const includesOf = async (pkg, configFile) => {
  const mod = await import(join(ROOT, pkg, configFile));
  const { test } = mod.default;
  const projects = test.projects ?? [];
  const globs = projects.length
    ? projects.flatMap((p) => p.test?.include ?? [])
    : (test.include ?? []);
  return globs.map((g) => globToRe(`${pkg}/${g}`));
};

describe("every test file is collected by some runner (#1633)", () => {
  it.each([
    ["app", "vitest.config.ts", /[/]__tests__[/].*[.]test[.]tsx?$/],
    ["component", "vite.config.ts", /[.]test[.]tsx?$/],
    ["cli", "vitest.config.ts", /[/]__tests__[/].*[.]test[.]ts$/],
  ])("%s", async (pkg, configFile, looksLikeATest) => {
    const patterns = await includesOf(pkg, configFile);
    // Vacuity guard: a broken parse would make every file look uncollected,
    // or find no files to check at all.
    expect(patterns.length).toBeGreaterThan(0);
    const onDisk = walk(`${pkg}/src`, looksLikeATest);
    expect(onDisk.length).toBeGreaterThan(10);

    const orphans = onDisk.filter((f) => !patterns.some((re) => re.test(f)));
    expect(
      orphans,
      `these look like tests and no include pattern in ${pkg}/${configFile} ` +
        "matches them, so they never run and nothing says so",
    ).toEqual([]);
  });

  it.each([
    ["app", "vitest.config.ts", "app/src/lib/widget/__tests__/example.test.ts"],
    ["component", "vite.config.ts", "component/src/lib/__tests__/example.test.ts"],
    ["cli", "vitest.config.ts", "cli/src/lib/__tests__/example.test.ts"],
  ])(
    "%s collects a test written where CLAUDE.md says to put it",
    async (pkg, configFile, conventional) => {
      // CLAUDE.md: "Tests live in `__tests__/` next to the file under test".
      // cli's include was `src/__tests__` — one root directory — so following
      // that instruction produced a file no runner collected, with no warning.
      const patterns = await includesOf(pkg, configFile);
      expect(
        patterns.some((re) => re.test(conventional)),
        `${conventional} is the documented location and ${pkg}/${configFile} ` +
          "would not collect it",
      ).toBe(true);
    },
  );

  it("connection's lint glob follows what its jest actually collects", () => {
    // connection/jest.config.js deliberately collects any .ts under
    // __tests__, so 25 of its suites are not named with a .test.ts suffix.
    // The eslint block carrying the test anti-pattern rules must use the SAME
    // glob, or those suites get no test-lint rules — and an `it.only` in one
    // of them silences its file while `npm run lint` stays green.
    const eslintConfig = readFileSync(join(ROOT, "eslint.config.js"), "utf8");
    // The block is identified by its plugin, not by a string that also appears
    // in the unrelated no-explicit-any exception for the same directory.
    const jestBlock = eslintConfig.slice(
      eslintConfig.lastIndexOf("files:", eslintConfig.indexOf("jest: jestPlugin")),
      eslintConfig.indexOf("jest: jestPlugin"),
    );
    expect(jestBlock).toContain("connection/__tests__/**/*.ts");
    expect(jestBlock).not.toContain("connection/**/*.test.ts");
  });

  it("scripts/__tests__ gets the test anti-pattern rules too", () => {
    // A sixth test root: `npm run verify` runs it and `npm run lint` reported
    // on none of it — including the ratchet that exists to guarantee every
    // package is linted.
    const eslintConfig = readFileSync(join(ROOT, "eslint.config.js"), "utf8");
    expect(eslintConfig).toContain("scripts/__tests__/**");
  });
});
