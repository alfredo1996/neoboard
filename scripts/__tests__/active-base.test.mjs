import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { activeBase } from "../lib/active-base.mjs";

/**
 * #1854 — `review:local` hardcoded `--base release/1.5`, so at the next release
 * it would review against a stale base without saying so. CLAUDE.md drifted to
 * "vs release/1.4" exactly that way. The base is now picked from what exists
 * on origin, the same rule the pr and next skills use.
 */

const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");

/** `git ls-remote --heads` output for the given branch names. */
const lsRemote = (...branches) =>
  branches
    .map((b, i) => `${String(i).padStart(40, "0")}\trefs/heads/${b}`)
    .join("\n");

describe("activeBase (#1854)", () => {
  it("picks the highest release branch by version, not by string order", () => {
    // As strings, "release/1.9" sorts after "release/1.10".
    expect(
      activeBase(lsRemote("release/1.9", "release/1.10", "release/1.2")),
    ).toBe("release/1.10");
  });

  it("ignores refs that only look like release branches", () => {
    expect(
      activeBase(
        lsRemote(
          "release/1.5",
          "release-notes",
          "releases/2.0",
          "feat/release/9.9",
          "release/next",
        ),
      ),
    ).toBe("release/1.5");
  });

  it("falls back to dev when there is no release branch", () => {
    expect(activeBase("")).toBe("dev");
    expect(activeBase(lsRemote("dev", "main"))).toBe("dev");
  });

  it("lets an explicit override win", () => {
    expect(activeBase(lsRemote("release/1.5"), "dev")).toBe("dev");
  });

  it("ignores a blank override", () => {
    expect(activeBase(lsRemote("release/1.5"), "  ")).toBe("release/1.5");
  });
});

describe("review:local (#1854)", () => {
  it("runs the script instead of naming a release branch", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    expect(pkg.scripts["review:local"]).toBe("node scripts/review-local.mjs");
  });
});
