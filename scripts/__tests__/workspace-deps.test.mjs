import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * #2188 — `app` declared `@neoboard/enterprise` as an optional dependency, a
 * name no workspace owns and nobody had claimed on npm, so every install
 * fetched it. An `@neoboard/*` dependency must be one of our workspaces.
 */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const read = (dir) =>
  JSON.parse(readFileSync(join(ROOT, dir, "package.json"), "utf8"));

const KINDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

describe("workspace manifests", () => {
  it("depend only on @neoboard packages that are workspaces", () => {
    const manifests = read(".").workspaces.map(read);
    const owned = new Set(manifests.map((m) => m.name));
    const foreign = manifests.flatMap((m) =>
      KINDS.flatMap((k) =>
        Object.keys(m[k] ?? {})
          .filter((d) => d.startsWith("@neoboard/") && !owned.has(d))
          .map((d) => `${m.name} -> ${d}`),
      ),
    );
    expect(foreign).toEqual([]);
  });
});
