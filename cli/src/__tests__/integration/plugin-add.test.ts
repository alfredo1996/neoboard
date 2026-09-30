/**
 * `plugin add` against a real npm (#2065).
 *
 * A failed add leaves package.json, the lockfile and both manifests byte for
 * byte as they were and takes the package back out of node_modules. A `file:`
 * fixture installed with `--offline` needs neither the registry nor Docker.
 *
 * The CLI imports a plugin from its own location, which a tmp checkout is not
 * an ancestor of, so each test mocks the import. npm, the manifests, the
 * validator and the codegen run for real.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("../../lib/config.js", () => ({
  assertCheckout: vi.fn(),
  findProjectRoot: vi.fn(),
}));

vi.mock("../../lib/output.js", () => ({
  success: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  createSpinner: () => ({ start() {}, succeed() {}, fail() {} }),
}));

import { findProjectRoot } from "../../lib/config.js";
import { error as logError } from "../../lib/output.js";
import { runPluginAdd } from "../../commands/plugin.js";

const PKG = "neoboard-plugin-add-fixture";
const SPEC = "file:../fixture";
const FILES = [
  "package.json",
  "package-lock.json",
  "neoboard-plugins.json",
  "neoboard-connectors.json",
];
const CONNECTOR = {
  type: "fixture",
  label: "Fixture",
  category: "database",
  createModule: () => ({}),
};
const CHART = { type: "fixture", label: "Fixture", transform: () => ({}) };

let dir: string;
let root: string;

const read = (file: string) => readFileSync(join(root, file), "utf8");
const manifest = (key: string) =>
  JSON.stringify({ $schema: "./x.schema.json", [key]: [] }, null, 4);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("npm_config_offline", "true");
  vi.stubEnv("npm_config_audit", "false");
  vi.stubEnv("npm_config_fund", "false");
  process.exitCode = 0;

  dir = mkdtempSync(join(tmpdir(), "plugin-add-it-"));
  mkdirSync(join(dir, "fixture"));
  writeFileSync(
    join(dir, "fixture", "package.json"),
    JSON.stringify({ name: PKG, version: "1.0.0" }),
  );

  root = join(dir, "root");
  mkdirSync(join(root, "scripts"), { recursive: true });
  // Not npm's formatting, so only a byte-for-byte restore reproduces it.
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "root", private: true }, null, 4),
  );
  execFileSync("npm", ["install"], { cwd: root, stdio: "pipe" }); // lockfile
  // Each manifest keeps the `$schema` that addToManifest drops.
  writeFileSync(join(root, "neoboard-plugins.json"), manifest("plugins"));
  writeFileSync(join(root, "neoboard-connectors.json"), manifest("connectors"));
  writeFileSync(join(root, "scripts", "generate-plugin-imports.mjs"), "");
  writeFileSync(
    join(root, "scripts", "generate-connector-imports.mjs"),
    "process.exit(1);",
  );
  vi.mocked(findProjectRoot).mockReturnValue(root);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.doUnmock(PKG);
  rmSync(dir, { recursive: true, force: true });
  process.exitCode = 0;
});

describe("plugin add with a real npm (#2065)", () => {
  it.each([
    ["validation fails", { label: "no type" }, "not a valid NeoBoard plugin"],
    ["codegen fails after the manifest write", CONNECTOR, "Codegen failed"],
  ])(
    "when %s, leaves every file byte-identical and node_modules without the package",
    async (_, exported, why) => {
      vi.doMock(PKG, () => ({ default: exported }));
      const before = FILES.map(read);

      await runPluginAdd(SPEC);

      // npm did install it: the add got as far as the failure under test.
      expect(vi.mocked(logError)).toHaveBeenCalledWith(
        expect.stringContaining(why),
      );
      expect(FILES.map(read)).toEqual(before);
      expect(existsSync(join(root, "node_modules", PKG))).toBe(false);
      expect(process.exitCode).toBe(1);
    },
    30_000,
  );

  it("registers the package under npm save=false, and again on a re-add", async () => {
    vi.stubEnv("npm_config_save", "false");
    vi.doMock(PKG, () => ({ default: CHART }));

    await runPluginAdd(SPEC);
    await runPluginAdd(SPEC);

    expect(vi.mocked(logError)).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
    expect(JSON.parse(read("package.json")).dependencies).toEqual({
      [PKG]: SPEC,
    });
    expect(JSON.parse(read("neoboard-plugins.json")).plugins).toEqual([
      { package: PKG },
    ]);
  }, 30_000);
});
