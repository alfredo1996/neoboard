import { describe, it, expect, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { MARKERS, checkServerBundle } from "../check-server-bundle.mjs";

// NVL and mobx are browser-only: a server bundle that evaluates them warns
// about multiple mobx instances (#2059). CI runs the check on the real build.

const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
let dir;
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** A fake `.next` holding the given files, with the markers in a browser chunk. */
function build(files) {
  dir = mkdtempSync(join(tmpdir(), "next-"));
  const all = { "static/chunks/graph.js": MARKERS.join(";"), ...files };
  for (const [path, text] of Object.entries(all)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

describe("no server bundle holds NVL or mobx (#2059)", () => {
  it("passes a server with neither", () => {
    expect(checkServerBundle(build({ "server/chunks/1.js": "x" }))).toEqual([]);
  });

  it("names each server chunk holding a marker", () => {
    const next = build({ "server/chunks/5410.js": `a;${MARKERS[1]};b` });
    expect(checkServerBundle(next)).toEqual([
      `${join(next, "server/chunks/5410.js")} holds "${MARKERS[1]}"`,
    ]);
  });

  it("ignores source maps, which quote source comments", () => {
    const next = build({ "server/chunks/1.js.map": MARKERS[0] });
    expect(checkServerBundle(next)).toEqual([]);
  });

  it("fails a marker the browser chunks no longer carry, rather than passing vacuously", () => {
    const next = build({
      "static/chunks/graph.js": MARKERS[0],
      "server/chunks/1.js": "x",
    });
    expect(checkServerBundle(next)).toEqual([
      `"${MARKERS[1]}" is in no browser chunk, so it no longer identifies its library`,
    ]);
  });

  it("runs in CI right after the E2E job's build", () => {
    const ci = readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");
    const build = ci.indexOf("- name: Build Next.js");
    const check = ci.indexOf("run: node scripts/check-server-bundle.mjs");
    expect(build).toBeGreaterThan(-1);
    expect(check).toBeGreaterThan(build);
    expect(ci.indexOf("- name: Run E2E tests")).toBeGreaterThan(check);
  });
});
