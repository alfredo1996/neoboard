import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";

// #1689 — generated and dead artefacts must stay out of the index.
//
// `docs/.astro/` is Astro's content-collection cache, rewritten by every docs
// build. Tracking it dirtied every fresh checkout and got swept into an
// unrelated PR (#1604). The other two are screenshot dumps nothing reads.
// `.gitignore` stops a plain `git add -A`; this ratchet catches `git add -f`
// and any future regression that re-tracks them.

const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");

const UNTRACKED = ["docs/.astro", "design-shots", "screenshots/v1.1-redesign"];

describe("generated artefacts are not tracked (#1689)", () => {
  for (const path of UNTRACKED) {
    it(`git ls-files ${path} is empty`, () => {
      const res = spawnSync("git", ["ls-files", "--", path], {
        cwd: ROOT,
        encoding: "utf8",
      });
      expect(res.status, res.stderr).toBe(0);
      expect(res.stdout.trim()).toBe("");
    });
  }
});
