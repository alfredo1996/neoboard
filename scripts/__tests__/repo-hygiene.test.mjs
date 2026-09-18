import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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
      } catch (err) {
        // 1 is "not ignored"; anything else (128: bad pathspec or repo state)
        // is a real failure and must not read as a clean result.
        if (err.status !== 1) throw err;
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

describe("the root listing is what a visitor should see (#1885)", () => {
  const read = (p) => readFileSync(join(ROOT, p), "utf8");

  // GitHub renders these from `.github/` too, but the root listing was the
  // only place a visitor could tell the project takes contributions and
  // security seriously — and it showed none of them.
  it.each(["CONTRIBUTING.md", "SECURITY.md", "CODE_OF_CONDUCT.md"])(
    "%s is at the root, not in .github/",
    (file) => {
      expect(existsSync(join(ROOT, file))).toBe(true);
      expect(existsSync(join(ROOT, ".github", file))).toBe(false);
    },
  );

  // The inverse: the enterprise guide describes a private repo and a tier
  // v1.5 does not ship (#1845), and only setup-enterprise.sh links it.
  it("CONTRIBUTING-enterprise.md is in .github/, not at the root", () => {
    expect(existsSync(join(ROOT, "CONTRIBUTING-enterprise.md"))).toBe(false);
    expect(existsSync(join(ROOT, ".github/CONTRIBUTING-enterprise.md"))).toBe(
      true,
    );
  });

  // NOTICE.md records the unknown provenance of the world.geo.json the
  // choropleth ships (#1402/#1543); an unlinked legal file is worse than none.
  it("the README links NOTICE.md", () => {
    expect(read("README.md")).toContain("(NOTICE.md)");
  });

  // The root solution config referenced two projects that set no `composite`,
  // so `tsc -b` could not have run it — and `typecheck` never tried.
  it("has no root tsconfig.json unless typecheck runs it", () => {
    if (!existsSync(join(ROOT, "tsconfig.json"))) return;
    const { scripts } = JSON.parse(read("package.json"));
    expect(scripts.typecheck).toMatch(/tsc\s+-b/);
  });

  // This page is where a user lands on a version error, so a minimum it states
  // that `doctor` does not enforce tells a working install to reinstall.
  it("the Node-version troubleshooting section states the minimum doctor enforces", () => {
    const floor = /major >= (\d+)/.exec(read("cli/src/commands/doctor.ts"))?.[1];
    expect(floor).toMatch(/^\d+$/);

    const page = read("docs/src/content/docs/start-here/troubleshooting.mdx");
    const section = page
      .split("### Symptom: `Node version not supported`")[1]
      .split("\n---")[0];
    expect(section).toContain(`Node ${floor} or newer`);
  });

  // `.nvmrc` said 20 while eleven of twelve workflows hardcoded 22 and none
  // read the file, so the two could drift silently.
  it(".nvmrc is the Node version the workflows run", () => {
    const major = read(".nvmrc").trim().split(".")[0];
    expect(major).toMatch(/^\d+$/);

    const dir = join(ROOT, ".github/workflows");
    const workflows = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
    expect(workflows.length).toBeGreaterThan(5);

    const drift = [];
    let fromFile = 0;
    for (const file of workflows) {
      const yaml = readFileSync(join(dir, file), "utf8");
      for (const m of yaml.matchAll(/^\s*node-version:\s*["']?([^"'\s]+)/gm))
        if (m[1].split(".")[0] !== major) drift.push(`${file}: ${m[1]}`);
      for (const m of yaml.matchAll(/^\s*node-version-file:\s*["']?([^"'\s]+)/gm)) {
        if (m[1] !== ".nvmrc") drift.push(`${file}: ${m[1]}`);
        else fromFile += 1;
      }
    }
    expect(drift).toEqual([]);
    expect(fromFile).toBeGreaterThan(0);
  });
});
