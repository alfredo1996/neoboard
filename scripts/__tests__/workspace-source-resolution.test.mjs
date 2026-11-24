import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { workspaceSourceAliases } from "../../vitest.workspace-source.ts";

// #1878: app tests read the workspace packages from src/, because their
// `exports` point at dist/ and `npm ci` builds neither. A new `exports`
// subpath with no alias would bring the fresh-worktree failure back.
const root = join(fileURLToPath(import.meta.url), "..", "..", "..");
const readJson = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const aliases = workspaceSourceAliases;

const packages = ["connection", "connector-sdk"].map((dir) => {
  const pkg = readJson(`${dir}/package.json`);
  return { dir, name: pkg.name, exports: pkg.exports };
});

// Leaf strings of an `exports` map: subpath keys are not targets.
const leaves = (v) =>
  typeof v === "string" ? [v] : Object.values(v).flatMap(leaves);

const specifiers = packages.flatMap(({ name, exports }) =>
  Object.keys(exports).map((key) => name + key.slice(1)),
);

describe("workspace packages resolve from source in app tests", () => {
  it.each(specifiers)("%s has an alias to an existing file", (spec) => {
    const alias = aliases.find((a) => a.find.test(spec));
    expect(alias, `no vitest alias for ${spec}`).toBeDefined();
    expect(existsSync(alias.replacement)).toBe(true);
    expect(alias.replacement).toContain("/src/");
  });

  it("an alias does not swallow a sibling specifier", () => {
    expect(aliases.some((a) => a.find.test("@neoboard/connection-extra"))).toBe(
      false,
    );
  });

  it("connector-sdk still publishes only dist/", () => {
    const sdk = packages.find((p) => p.dir === "connector-sdk");
    const targets = leaves(sdk.exports);
    expect(targets.length).toBeGreaterThan(0);
    for (const t of targets) expect(t.startsWith("./dist/")).toBe(true);
  });

  it("leaves ignores subpath keys and recurses into conditions", () => {
    expect(
      leaves({ "./x": { types: "./dist/x.d.ts", import: "./dist/x.js" } }),
    ).toEqual(["./dist/x.d.ts", "./dist/x.js"]);
  });

  it.each(specifiers)("%s has a typecheck path under src/", (spec) => {
    // the file carries // comments, which JSON.parse rejects
    const typecheck = JSON.parse(
      readFileSync(join(root, "app/tsconfig.typecheck.json"), "utf8").replace(
        /^\s*\/\/.*$/gm,
        "",
      ),
    );
    const target = typecheck.compilerOptions.paths[spec];
    expect(target, ).toBeDefined();
    expect(target[0]).toContain("/src/");
    expect(existsSync(join(root, "app", target[0]))).toBe(true);
  });

  it("app tsconfig paths do not map the workspace packages", () => {
    const text = readFileSync(join(root, "app/tsconfig.json"), "utf8");
    expect(text).not.toMatch(/@neoboard\/connection|@neoboard\/connector-sdk/);
  });
});
