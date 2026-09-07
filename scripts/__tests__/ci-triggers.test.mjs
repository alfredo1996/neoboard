import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #1627 — CI runs on a path allowlist, and two directories were missing from
 * it, so a PR confined to either started no runner at all: no typecheck, no
 * lint, no tests, no Sonar.
 *
 * `connector-sdk/` holds `src/conformance/query-safety.ts`, the harness every
 * connector runs to prove it honours the Query Safety rules. It was the one
 * cross-connector safety contract in the repo and it could be edited with zero
 * CI execution. `docker/postgres/init-test.sql` is mounted into the Postgres
 * testcontainer by `app/e2e/global-setup.ts` — the fixture substrate for all
 * 54 E2E specs.
 *
 * An allowlist fails open: forget an entry and the answer is silence. This
 * asserts every workspace and every directory CI actually depends on is
 * listed, so the next one cannot be forgotten quietly.
 */

const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const ci = readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

/** The `paths:` list under each trigger, as raw entries. */
function pathFilters(yaml) {
  const blocks = [];
  const lines = yaml.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*paths:\s*$/.test(lines[i])) continue;
    const indent = lines[i].search(/\S/);
    const entries = [];
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (!line.trim() || /^\s*#/.test(line)) continue;
      if (line.search(/\S/) <= indent) break;
      const m = line.match(/^\s*-\s*'?([^'#\s]+)'?/);
      if (m) entries.push(m[1]);
    }
    blocks.push(entries);
  }
  return blocks;
}

const blocks = pathFilters(ci);

describe("CI path filters (#1627)", () => {
  it("finds a paths: list on more than one trigger", () => {
    // Vacuity guard: a parser that matched nothing would pass every case below.
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    for (const b of blocks) expect(b.length).toBeGreaterThan(5);
  });

  it.each(pkg.workspaces)("triggers CI for the %s workspace", (ws) => {
    for (const filters of blocks) {
      expect(filters, `workspace "${ws}" is not in a paths: filter`).toContain(
        `${ws}/**`,
      );
    }
  });

  it("triggers CI for the hooks that have tests", () => {
    // They are presented as enforcement of the project's most important rules
    // and had no tests and no CI at all until #1634.
    for (const filters of blocks) {
      expect(filters).toContain(".claude/hooks/**");
      expect(filters).toContain(".claude/settings.json");
    }
  });

  it("triggers CI for the E2E fixture substrate", () => {
    // global-setup.ts mounts docker/postgres/init-test.sql into the container
    // every E2E spec runs against.
    for (const filters of blocks) {
      expect(filters, "docker/ is not in a paths: filter").toContain(
        "docker/**",
      );
    }
  });
});
