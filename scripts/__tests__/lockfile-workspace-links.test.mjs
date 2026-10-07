import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * #2188 — `app` declared `@neoboard/enterprise` as an optional dependency, a
 * name no workspace owns and nobody had claimed on npm, so every install
 * fetched it. The lockfile is where a registry lookup shows up whatever
 * manifest asked for it (root, workspace, any dependency kind, any version
 * pin), so the guard reads it: every package under our own scope must resolve
 * to a workspace link. The scope comes from the workspace names, so it
 * follows the v1.7 rename instead of matching nothing.
 */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const readJson = (path) => JSON.parse(readFileSync(join(ROOT, path), "utf8"));

const workspaceNames = readJson("package.json").workspaces.map(
  (dir) => readJson(join(dir, "package.json")).name,
);
const scopes = [...new Set(workspaceNames.map((n) => n.split("/")[0]))];
const ownScope = (key) =>
  scopes.some((s) => new RegExp(`(^|/)node_modules/${s}/`).test(key));

describe("lockfiles and our own package scope", () => {
  it("resolve every scoped package in the root lockfile to a workspace link", () => {
    const own = Object.entries(readJson("package-lock.json").packages).filter(
      ([key]) => ownScope(key),
    );
    expect(own.length).toBeGreaterThan(0);
    const fetched = own.filter(([, p]) => p.link !== true).map(([key]) => key);
    expect(fetched).toEqual([]);
  });

  it("have no scoped package at all in docs, a separate install", () => {
    const own = Object.keys(readJson("docs/package-lock.json").packages).filter(
      ownScope,
    );
    expect(own).toEqual([]);
  });
});
