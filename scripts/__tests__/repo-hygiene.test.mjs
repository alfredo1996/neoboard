import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #1872 — the repo carried config, scripts and CI steps that pointed at files
 * deleted long ago, and nothing said so. `stress/` went in 455d6407 and stayed
 * in both the Sonar exclusions and the ESLint ignores; `app/src/middleware.ts`
 * went in f31188fc and stayed in `sonar.coverage.exclusions`;
 * `app/package.json` still ran `playwright.mock.config.ts`, which was never
 * committed at all.
 *
 * Each of these is a one-line claim about a path, checkable mechanically. This
 * file is the ratchet: a reference to something that is gone fails the build
 * instead of rotting.
 */

const ROOT = new URL("../..", import.meta.url).pathname.replace(/[/]$/, "");

/** This file names every removed path, so it must exclude itself. */
const SELF = "scripts/__tests__/repo-hygiene.test.mjs";

const git = (args) =>
  execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });

/** Tracked files referencing `needle`, ignoring history in the CHANGELOG. */
function trackedReferences(needle) {
  try {
    // `-e` is load-bearing: without it a needle starting with `-` is parsed
    // as a git option, and the error was indistinguishable from "no match",
    // so that needle asserted nothing.
    return git([
      "grep",
      "-nF",
      "-e",
      needle,
      "--",
      ".",
      ":!CHANGELOG.md",
      ":!package-lock.json",
      `:!${SELF}`,
    ])
      .split("\n")
      .filter(Boolean);
  } catch (err) {
    if (err.status !== 1) throw err; // exit 1 is "no match"; anything else is real
    return [];
  }
}

describe("removed paths are referenced by nothing (#1872)", () => {
  it.each([
    "bin/",
    ".env.example",
    "app/scripts",
    "docker/docker-compose.neo4j-enterprise.yml",
    "docker/neo4j/init.sh",
    "docker/postgres/init-test.sql",
    "scripts/record-journeys",
  ])("%s does not exist", (path) => {
    expect(existsSync(join(ROOT, path))).toBe(false);
  });

  it.each([
    "bin/neoboard",
    "envExample",
    "init-test.sql",
    "docker-compose.neo4j-enterprise",
    "record-journeys",
    "record:journeys",
    "test:e2e:mock",
    "db:lint",
    "lint-migrations",
    // The compose services and volumes, not the `sonarqube-scanner` package
    // that scripts/sonar-local.mjs still uses.
    "neoboard-sonarqube",
    "sonarqube_data",
    "--profile sonar",
    "COMPOSE_DOCKER_CLI_BUILD",
    "neoboard:integration-test",
  ])("nothing references %s", (needle) => {
    expect(trackedReferences(needle)).toEqual([]);
  });
});

describe("package scripts point at files that exist (#1872)", () => {
  // `app`'s `test:e2e:mock` ran `--config playwright.mock.config.ts` for
  // months; that file was never committed, so the script could only ever fail.
  it.each([".", "app"])("%s/package.json", (pkg) => {
    const manifest = JSON.parse(
      readFileSync(join(ROOT, pkg, "package.json"), "utf8"),
    );
    const scripts = Object.entries(manifest.scripts ?? {});
    expect(scripts.length).toBeGreaterThan(5);

    const missing = [];
    for (const [name, body] of scripts) {
      const targets = [
        ...body.matchAll(/\bnode\s+(?:--\S+\s+)*([^\s'"|&;]+)/g),
        ...body.matchAll(/--config\s+([^\s'"|&;]+)/g),
      ].map((m) => m[1]);
      for (const target of targets) {
        // Globs are matched by the runner, not resolved as a path, and a bare
        // flag means the invocation had no file argument at all.
        if (!target || target.includes("*") || target.startsWith("-")) continue;
        if (!existsSync(join(ROOT, pkg, target)))
          missing.push(`${name} → ${target}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe("Sonar and ESLint ignores point at real paths (#1872)", () => {
  /**
   * True when git would ignore `rel`, so it is expected to be absent. Checked
   * with and without a trailing slash: a directory-only pattern such as
   * `.design-sync/` does not match the bare name when the path is missing.
   */
  const gitIgnored = (rel) =>
    [rel, `${rel}/`].some((candidate) => {
      try {
        git(["check-ignore", "-q", "--no-index", candidate]);
        return true;
      } catch {
        return false;
      }
    });

  /**
   * A glob reduced to the literal path it constrains, or null when it names no
   * single path: `stress/**` → `stress`, `**\/node_modules/**` → null.
   */
  const literalPath = (glob) => {
    const base = glob.replace(/[/]\*\*$/, "");
    return base.includes("*") || base === "" ? null : base;
  };

  const literalsOf = (globs) =>
    globs.map(literalPath).filter((p) => p !== null && !gitIgnored(p));

  it.each(["sonar.exclusions", "sonar.coverage.exclusions"])(
    "%s",
    (property) => {
      // The properties file continues entries with a trailing backslash.
      const text = readFileSync(join(ROOT, "sonar-project.properties"), "utf8")
        .replace(/\\\n/g, "")
        .split("\n")
        .find((line) => line.startsWith(`${property}=`));
      expect(text, `${property} is not set`).toBeTruthy();

      const globs = text
        .slice(property.length + 1)
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
      const literals = literalsOf(globs);
      expect(literals.length).toBeGreaterThan(0);
      expect(literals.filter((p) => !existsSync(join(ROOT, p)))).toEqual([]);
    },
  );

  it("eslint.config.js globalIgnores", () => {
    const config = readFileSync(join(ROOT, "eslint.config.js"), "utf8");
    const block = config.slice(
      config.indexOf("globalIgnores(["),
      config.indexOf("]),"),
    );
    const globs = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    const literals = literalsOf(globs);
    expect(literals.length).toBeGreaterThan(0);
    expect(literals.filter((p) => !existsSync(join(ROOT, p)))).toEqual([]);
  });
});

describe("no CI step is fully masked by `|| true` (#1872)", () => {
  // ci.yml's "Verify image runs" ended every docker command in `|| true`, so
  // it reported success whether or not the container started. The real check
  // was the `docker build` step before it.
  //
  // Diagnostic and cleanup steps (`if: always()` / `if: failure()`) are
  // exempt: masking is the point there.
  const TRIVIAL = /^(sleep|echo|:|true)\b/;

  /** Steps as `{ name, conditional, commands }`, one entry per `run:`. */
  function steps(yaml) {
    const lines = yaml.split("\n");
    const out = [];
    let current = null;
    let runIndent = -1;
    for (const line of lines) {
      if (runIndent >= 0) {
        const indent = line.search(/\S/);
        if (line.trim() === "" || indent > runIndent) {
          out.at(-1).body.push(line.trim());
          continue;
        }
        runIndent = -1;
      }
      const name = /^\s*-\s*name:\s*(.+?)\s*$/.exec(line);
      if (name) current = { name: name[1], conditional: false };
      if (/^\s*if:\s*(always|failure)\(\)/.test(line) && current) {
        current.conditional = true;
      }
      const run = /^(\s*)run:\s*(\|-?|>-?)?\s*(.*)$/.exec(line);
      if (run && current) {
        out.push({ ...current, body: run[3] ? [run[3]] : [] });
        if (run[2]) runIndent = run[1].length;
      }
    }
    // Join backslash continuations, then drop comments and blanks.
    return out.map((step) => ({
      ...step,
      commands: step.body
        .join("\n")
        .replace(/\\\n\s*/g, " ")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#")),
    }));
  }

  it.each([
    ".github/workflows/ci.yml",
    ".github/workflows/cli-integration.yml",
  ])("%s", (workflow) => {
    const parsed = steps(readFileSync(join(ROOT, workflow), "utf8"));
    expect(parsed.length).toBeGreaterThan(3);

    const masked = parsed
      .filter((step) => !step.conditional)
      .filter((step) => {
        const meaningful = step.commands.filter((c) => !TRIVIAL.test(c));
        return (
          meaningful.length > 0 &&
          meaningful.every((c) => /\|\|\s*true$/.test(c))
        );
      })
      .map((step) => step.name);
    expect(
      masked,
      "every command in these steps ends in `|| true`, so they pass " +
        "whatever happens and check nothing",
    ).toEqual([]);
  });
});
