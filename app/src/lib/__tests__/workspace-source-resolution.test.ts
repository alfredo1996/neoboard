import { describe, it, expect } from "vitest";

// #1878: the workspace packages export only dist/, which `npm ci` does not
// build. App tests resolve them to src/ instead, so a fresh worktree passes and
// an edit to connection/src is seen without a rebuild.
describe("workspace packages in app tests", () => {
  it.each([
    ["@neoboard/connection", "/connection/src/index.ts"],
    ["@neoboard/connector-sdk", "/connector-sdk/src/index.ts"],
  ])("%s resolves from source", async (spec, tail) => {
    const mod = await import(/* @vite-ignore */ `${spec}?url`);
    expect(mod.default).toContain(tail);
  });
});
