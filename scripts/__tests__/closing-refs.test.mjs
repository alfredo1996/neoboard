import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/**
 * #1853 — GitHub closes `Closes #N` issues only for PRs merged into the default
 * branch (dev). Every release/* merge left its issues open and they were closed
 * by hand.
 *
 * The parser lives inline in .github/workflows/close-issues-on-merge.yml, not
 * in a checked-out script: after the merge the base branch contains the PR's
 * own changes, so a checked-out script could be one the PR rewrote. These tests
 * extract that inline block and run it, so the tested code is the code that
 * runs.
 */

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const REPO = "alfredo1996/neoboard";

/** The inline parser from the workflow, dedented. */
function inlineParser() {
  const wf = readFileSync(
    join(ROOT, ".github/workflows/close-issues-on-merge.yml"),
    "utf8",
  );
  const m = /node - <<'JS'\n([\s\S]*?)\n[ \t]*JS\n/.exec(wf);
  if (!m) throw new Error("no inline `node - <<'JS'` parser in the workflow");
  const lines = m[1].split("\n");
  const indent = Math.min(
    ...lines.filter((l) => l.trim()).map((l) => l.match(/^[ \t]*/)[0].length),
  );
  return lines.map((l) => l.slice(indent)).join("\n");
}

/** Run the workflow's parser the way the workflow does: body in an env var. */
function closingRefs(body, repo = REPO) {
  const env = { ...process.env, REPO: repo };
  delete env.BODY;
  if (body != null) env.BODY = body;
  const out = execFileSync("node", ["-"], {
    input: inlineParser(),
    env,
    encoding: "utf8",
  }).trim();
  return out ? out.split(" ").map(Number) : [];
}

describe("the workflow's inline closing-reference parser (#1853)", () => {
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
    expect(closingRefs(body)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("ignores case and accepts a colon", () => {
    expect(closingRefs("Closes: #10\nFIXES #11")).toEqual([10, 11]);
  });

  it("accepts owner/repo#N only for this repository", () => {
    expect(
      closingRefs(
        "Closes alfredo1996/neoboard#12\nCloses Alfredo1996/NeoBoard#14\nCloses other/repo#13",
      ),
    ).toEqual([12, 14]);
  });

  it("ignores references without a closing keyword", () => {
    expect(closingRefs("See #14, related to #15")).toEqual([]);
  });

  it("does not match a keyword buried in another word", () => {
    expect(closingRefs("prefix #16\nunfixed #17")).toEqual([]);
  });

  it("closes only the first reference after a keyword, as GitHub does", () => {
    expect(closingRefs("Closes #1, #2")).toEqual([1]);
  });

  it("collapses duplicates and sorts", () => {
    expect(closingRefs("Closes #20\nfixes #3\ncloses #20")).toEqual([3, 20]);
  });

  it("returns nothing for an empty or missing body", () => {
    expect(closingRefs("")).toEqual([]);
    expect(closingRefs(null)).toEqual([]);
  });

  it("treats shell metacharacters in the body as plain text", () => {
    expect(closingRefs("Closes #7 $(touch /tmp/pwned) `id`; rm -rf ~")).toEqual(
      [7],
    );
  });
});
