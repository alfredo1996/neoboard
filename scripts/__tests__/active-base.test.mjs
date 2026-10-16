import { describe, it, expect, vi, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { activeBase, resolveBase } from "../lib/active-base.mjs";

vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));

/**
 * #1854 — `review:local` hardcoded `--base release/1.5`, so at the next release
 * it would review against a stale base without saying so. CLAUDE.md drifted to
 * "vs release/1.4" exactly that way. The base is now picked from what exists
 * on origin, the same rule the pr and next skills use.
 */

// fileURLToPath, not URL.pathname: pathname keeps %20 for a space in the path.
const ROOT = fileURLToPath(new URL("../..", import.meta.url));

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

/**
 * #2234 — with release/1.6.1 and release/1.7 open at once, "the newest
 * release branch" sent every v1.6.1 bug fix to release/1.7. The issue's
 * milestone picks the branch; the newest one is only the fallback.
 */
describe("activeBase from the issue's milestone (#2234)", () => {
  const refs = lsRemote("release/1.6", "release/1.6.1", "release/1.7");

  it("a patch milestone picks its own branch, not the newest", () => {
    expect(activeBase(refs, undefined, "v1.6.1")).toBe("release/1.6.1");
  });

  it("a patch milestone without its own branch picks release/X.Y", () => {
    expect(activeBase(lsRemote("release/1.7"), undefined, "v1.7.1")).toBe(
      "release/1.7",
    );
  });

  it("a minor milestone picks release/X.Y, whatever follows the version in its title", () => {
    expect(
      activeBase(
        lsRemote("release/1.6.1", "release/1.7", "release/1.8"),
        undefined,
        "v1.7 — Hastings: rename and redesign",
      ),
    ).toBe("release/1.7");
    // By number, not by prefix or as a decimal: 1.1 is not 1.10.
    expect(
      activeBase(lsRemote("release/1.10", "release/1.1"), undefined, "v1.1"),
    ).toBe("release/1.1");
  });

  it("a milestone with no branch of its own takes the newest release branch", () => {
    expect(activeBase(refs, undefined, "v1.8 — Authoring")).toBe("release/1.7");
    // v1.5 is not release/1.5.1: the match is exact, not by prefix.
    expect(
      activeBase(lsRemote("release/1.5.1", "release/1.7"), undefined, "v1.5"),
    ).toBe("release/1.7");
    expect(activeBase(refs, undefined, "Backlog")).toBe("release/1.7");
  });

  it("falls back to dev with no release branch, and an override still wins", () => {
    expect(activeBase(lsRemote("dev"), undefined, "v1.6.1")).toBe("dev");
    expect(activeBase(refs, "dev", "v1.6.1")).toBe("dev");
  });
});

describe("resolveBase (#2234)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    execFileSync.mockReset();
  });

  /** Answers each command by its first words; anything else is a test bug. */
  const answer = (outputs) =>
    execFileSync.mockImplementation((cmd, args) => {
      const line = `${cmd} ${args.join(" ")}`;
      const hit = Object.keys(outputs).find((k) => line.startsWith(k));
      if (hit === undefined) throw new Error(`unexpected: ${line}`);
      if (outputs[hit] instanceof Error) throw outputs[hit];
      return outputs[hit];
    });
  const ghCalls = () =>
    execFileSync.mock.calls
      .filter(([cmd]) => cmd === "gh")
      .map(([, a]) => a[1]);

  const refs = `${lsRemote("release/1.6.1", "release/1.7")}\n`;

  it("reads the milestone of the issue named in the branch", () => {
    answer({
      "git ls-remote": refs,
      "git branch --show-current": "fix/issue-2234-base-from-milestone\n",
      "gh api": "v1.6.1\n",
    });
    expect(resolveBase()).toBe("release/1.6.1");
    expect(ghCalls()).toEqual(["repos/{owner}/{repo}/issues/2234"]);
  });

  it("an issue passed in wins over the branch name", () => {
    answer({
      "git ls-remote": refs,
      "git branch --show-current": "fix/issue-2234-base-from-milestone\n",
      "gh api": "v1.7 — Hastings: rename and redesign\n",
    });
    expect(resolveBase({ issue: "#2240" })).toBe("release/1.7");
    expect(ghCalls()).toEqual(["repos/{owner}/{repo}/issues/2240"]);
  });

  it("with no issue, or gh failing, takes the newest release branch and says why", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    answer({
      "git ls-remote": refs,
      "git branch --show-current": "release/1.6.1\n",
    });
    expect(resolveBase()).toBe("release/1.7");
    expect(ghCalls()).toEqual([]);

    answer({
      "git ls-remote": refs,
      "git branch --show-current": "fix/issue-2234-x\n",
      "gh api": new Error("HTTP 502"),
    });
    expect(resolveBase()).toBe("release/1.7");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("#2234"));
  });

  it("an override wins without asking git or GitHub", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    answer({});
    expect(resolveBase({ override: " dev " })).toBe("dev");
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it("falls back to dev when origin cannot be listed", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    answer({
      "git ls-remote": new Error("timeout"),
      "git branch --show-current": "fix/issue-2234-x\n",
      "gh api": "v1.6.1\n",
    });
    expect(resolveBase()).toBe("dev");
  });
});

describe("review:local (#1854)", () => {
  it("runs the script instead of naming a release branch", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    expect(pkg.scripts["review:local"]).toBe("node scripts/review-local.mjs");
  });
});
