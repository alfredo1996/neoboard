import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { closingRefs } from "../ci/closing-refs.mjs";

/**
 * #1853 — GitHub closes `Closes #N` issues only for PRs merged into the default
 * branch (dev). Every release/* merge left its issues open and they were closed
 * by hand. This parser decides which issues a merged PR body closes, matching
 * the keywords GitHub itself recognises.
 */

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const REPO = "alfredo1996/neoboard";

describe("closingRefs (#1853)", () => {
  it("recognises every keyword form GitHub does", () => {
    const body = [
      "close #1",
      "closes #2",
      "closed #3",
      "fix #4",
      "fixes #5",
      "fixed #6",
      "resolve #7",
      "resolves #8",
      "resolved #9",
    ].join("\n");
    expect(closingRefs(body, REPO)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("ignores case and accepts a colon", () => {
    expect(closingRefs("Closes: #10\nFIXES #11", REPO)).toEqual([10, 11]);
  });

  it("accepts owner/repo#N only for this repository", () => {
    expect(
      closingRefs(
        "Closes alfredo1996/neoboard#12\nCloses Alfredo1996/NeoBoard#14\nCloses other/repo#13",
        REPO,
      ),
    ).toEqual([12, 14]);
  });

  it("ignores references without a closing keyword", () => {
    expect(closingRefs("See #14, related to #15", REPO)).toEqual([]);
  });

  it("does not match a keyword buried in another word", () => {
    expect(closingRefs("prefix #16\nunfixed #17", REPO)).toEqual([]);
  });

  it("closes only the first reference after a keyword, as GitHub does", () => {
    expect(closingRefs("Closes #1, #2", REPO)).toEqual([1]);
  });

  it("collapses duplicates and sorts", () => {
    expect(closingRefs("Closes #20\nfixes #3\ncloses #20", REPO)).toEqual([
      3, 20,
    ]);
  });

  it("returns nothing for an empty or missing body", () => {
    expect(closingRefs("", REPO)).toEqual([]);
    expect(closingRefs(null, REPO)).toEqual([]);
    expect(closingRefs(undefined, REPO)).toEqual([]);
  });
});

describe("closing-refs CLI (#1853)", () => {
  // The body arrives through an env var, never as a shell argument.
  const cli = (body) =>
    execFileSync("node", [join(ROOT, "scripts/ci/closing-refs.mjs")], {
      env: { ...process.env, BODY: body, REPO },
      encoding: "utf8",
    }).trim();

  it("prints the issue numbers space-separated", () => {
    expect(cli("Closes #1849\nCloses #923")).toBe("923 1849");
  });

  it("prints nothing when the body closes nothing", () => {
    expect(cli("No references here; also $(touch /tmp/pwned) `id`")).toBe("");
  });
});
