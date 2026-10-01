import { describe, it, expect, afterAll } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import nextConfig from "../../next.config";

// #2067 review: the server build marked every declared package external by
// name, skipping Next's check that the importing file and the app root load the
// same copy. A driver npm nested at another version (connection's 6.2 under a
// root 6.0) was then required at runtime from the root, at the wrong version.

type External =
  string | ((data: { context: string; request: string }) => unknown);

const APP = resolve(import.meta.dirname, "..", "..");
const [declared] = JSON.parse(readFileSync(join(APP, "package.json"), "utf8"))
  .neoboard.serverExternalPackages as string[];

/** What the server build does with `request` imported from a file in `context`. */
async function externalFor(context: string, request: string) {
  const config = nextConfig.webpack!(
    { externals: [], resolve: {} },
    { isServer: true } as never, // only isServer is read
  );
  for (const ext of config.externals as External[]) {
    const out =
      typeof ext === "string"
        ? ext === request && ext
        : await ext({ context, request });
    if (out) return out;
  }
}

describe("server externals (#2067)", () => {
  const nested = mkdtempSync(join(tmpdir(), "externals-2067-"));
  afterAll(() => rmSync(nested, { recursive: true, force: true }));

  it("keeps a declared package external where the app root loads the same copy", async () => {
    expect(await externalFor(join(APP, "src"), declared)).toBe(declared);
  });

  it("bundles a declared package the importing file resolves to another copy of", async () => {
    const pkg = join(nested, "node_modules", declared);
    mkdirSync(pkg, { recursive: true });
    writeFileSync(join(pkg, "package.json"), `{"name":"${declared}"}`);
    writeFileSync(join(pkg, "index.js"), "module.exports = {};\n");
    expect(await externalFor(nested, declared)).toBeUndefined();
  });

  it("leaves a package nobody declared to Next", async () => {
    expect(
      await externalFor(join(APP, "src"), "left-pad-2067"),
    ).toBeUndefined();
  });
});
