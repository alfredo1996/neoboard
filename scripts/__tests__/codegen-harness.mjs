import { describe, it, expect } from "vitest";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The test harness the connector and chart plugin codegens share (#2087).

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

export const CONNECTOR_CODEGEN = {
  file: "generate-connector-imports.mjs",
  manifest: "neoboard-connectors.json",
  key: "connectors",
  output: "connection/src/external-connectors.generated.ts",
  alias: "externalConnector0",
};

export const PLUGIN_CODEGEN = {
  file: "generate-plugin-imports.mjs",
  manifest: "neoboard-plugins.json",
  key: "plugins",
  output: "app/src/plugins/external-plugins.generated.ts",
  alias: "externalPlugin0",
};

/**
 * Run a copy of a codegen in a temp tree, from the package whose predev or
 * prebuild runs it, against manifest `entries` and the fixture `packages`
 * installed in the tree's own node_modules ({ name: { file: contents } }). A
 * copy keeps the checkout's generated file untouched.
 */
export function runCodegen(
  entries,
  packages = {},
  codegen = CONNECTOR_CODEGEN,
) {
  const tmp = mkdtempSync(join(tmpdir(), "codegen-"));
  try {
    mkdirSync(join(tmp, dirname(codegen.output)), { recursive: true });
    cpSync(join(ROOT, "scripts", "lib"), join(tmp, "scripts", "lib"), {
      recursive: true,
    });
    copyFileSync(
      join(ROOT, "scripts", codegen.file),
      join(tmp, "scripts", codegen.file),
    );
    for (const [name, files] of Object.entries(packages)) {
      for (const [file, contents] of Object.entries(files)) {
        const path = join(tmp, "node_modules", name, file);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, contents);
      }
    }
    writeFileSync(
      join(tmp, codegen.manifest),
      JSON.stringify({ [codegen.key]: entries }),
    );
    const res = spawnSync(process.execPath, [`../scripts/${codegen.file}`], {
      cwd: join(tmp, codegen.output.split("/")[0]),
      encoding: "utf8",
    });
    const output = join(tmp, codegen.output);
    return {
      status: res.status,
      stdout: res.stdout,
      stderr: res.stderr,
      generated: existsSync(output) ? readFileSync(output, "utf8") : null,
    };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// #2064 — the installed check resolved each package with CommonJS. A package
// whose exports map has only an `import` condition, the layout the SDK itself
// ships, threw ERR_PACKAGE_PATH_NOT_EXPORTED there and was reported as not
// installed, failing the build. The generated file is an ES module, so the
// check resolves the way its `import` does. #2087: the plugin codegen kept its
// own CommonJS copy, so each codegen's suite runs these against it.
export function describeInstalledCheck(codegen) {
  const run = (entries, packages) => runCodegen(entries, packages, codegen);

  describe(`${codegen.file}: the installed check resolves as the generated import does (#2064)`, () => {
    it("checks through the shared helper, never a CommonJS resolve", () => {
      const src = readFileSync(join(ROOT, "scripts", codegen.file), "utf8");
      expect(src).toContain('from "./lib/check-installed.mjs"');
      expect(src).not.toContain("createRequire");
    });

    it("accepts a package whose exports map has only an import condition", () => {
      const res = run([{ package: "@neoboard-test/esm-only-2064" }], {
        "@neoboard-test/esm-only-2064": {
          "package.json": JSON.stringify({
            name: "@neoboard-test/esm-only-2064",
            type: "module",
            exports: {
              ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
            },
          }),
          "dist/index.js": "export default {};\n",
        },
      });
      expect(res.status, res.stderr).toBe(0);
      expect(res.generated).toContain(
        `import ${codegen.alias} from "@neoboard-test/esm-only-2064";`,
      );
    });

    it("accepts a package with main and no exports map", () => {
      const res = run([{ package: "@neoboard-test/main-only-2064" }], {
        "@neoboard-test/main-only-2064": {
          "package.json": JSON.stringify({
            name: "@neoboard-test/main-only-2064",
            main: "index.js",
          }),
          "index.js": "module.exports = {};\n",
        },
      });
      expect(res.status, res.stderr).toBe(0);
      expect(res.generated).toContain(
        `import ${codegen.alias} from "@neoboard-test/main-only-2064";`,
      );
    });

    it("rejects a package that is not installed with the install hint", () => {
      const res = run([{ package: "@neoboard-test/not-installed-2064" }]);
      expect(res.status, res.stdout).toBe(1);
      expect(res.stderr).toContain(
        'Package "@neoboard-test/not-installed-2064" is not installed. Run: npm install @neoboard-test/not-installed-2064',
      );
      expect(res.generated).toBeNull();
    });
  });
}
