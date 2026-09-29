import { describe, it, expect } from "vitest";
import {
  copyFileSync,
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
import {
  validateEntry,
  validateManifest,
  renderSource,
} from "../generate-connector-imports.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const CODEGEN = "generate-connector-imports.mjs";

/**
 * Run a copy of the codegen in a temp tree, from connection/ as its prebuild
 * does, against `connectors` and the fixture `packages` installed in the
 * tree's own node_modules ({ name: { file: contents } }). A copy keeps the
 * checkout's generated file untouched.
 */
function runCodegen(connectors, packages = {}) {
  const tmp = mkdtempSync(join(tmpdir(), "codegen-"));
  try {
    mkdirSync(join(tmp, "scripts"));
    mkdirSync(join(tmp, "connection", "src"), { recursive: true });
    copyFileSync(join(ROOT, "scripts", CODEGEN), join(tmp, "scripts", CODEGEN));
    for (const [name, files] of Object.entries(packages)) {
      for (const [file, contents] of Object.entries(files)) {
        const path = join(tmp, "node_modules", name, file);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, contents);
      }
    }
    writeFileSync(
      join(tmp, "neoboard-connectors.json"),
      JSON.stringify({ connectors }),
    );
    const res = spawnSync(process.execPath, [`../scripts/${CODEGEN}`], {
      cwd: join(tmp, "connection"),
      encoding: "utf8",
    });
    const output = join(
      tmp,
      "connection",
      "src",
      "external-connectors.generated.ts",
    );
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

describe("validateEntry", () => {
  it("accepts a valid entry with package only", () => {
    expect(validateEntry({ package: "@myorg/neoboard-mongodb" }, 0)).toBeNull();
  });

  it("accepts a valid entry with all fields", () => {
    expect(
      validateEntry(
        { package: "@myorg/neoboard-mongodb", export: "plugin", overrides: true },
        0,
      ),
    ).toBeNull();
  });

  it("rejects non-object", () => {
    expect(validateEntry("string", 0)).toContain("must be an object");
  });

  it("rejects missing package", () => {
    expect(validateEntry({}, 0)).toContain("package must be a non-empty string");
  });

  it("rejects empty package", () => {
    expect(validateEntry({ package: "" }, 0)).toContain("non-empty");
  });

  it("rejects package with spaces", () => {
    expect(validateEntry({ package: "my package" }, 0)).toContain(
      "whitespace",
    );
  });

  it("rejects invalid export identifier", () => {
    expect(
      validateEntry({ package: "pkg", export: "not-valid" }, 0),
    ).toContain("valid JavaScript identifier");
  });

  it("accepts 'default' export", () => {
    expect(
      validateEntry({ package: "pkg", export: "default" }, 0),
    ).toBeNull();
  });

  it("rejects unknown keys", () => {
    expect(
      validateEntry({ package: "pkg", extra: true }, 0),
    ).toContain('unknown key "extra"');
  });
});

describe("validateManifest", () => {
  it("accepts empty connectors array", () => {
    const { errors, entries } = validateManifest({ connectors: [] });
    expect(errors).toHaveLength(0);
    expect(entries).toHaveLength(0);
  });

  it("accepts valid entries", () => {
    const { errors, entries } = validateManifest({
      connectors: [{ package: "@myorg/mongodb" }],
    });
    expect(errors).toHaveLength(0);
    expect(entries).toHaveLength(1);
    expect(entries[0].package).toBe("@myorg/mongodb");
    expect(entries[0].export).toBe("default");
    expect(entries[0].overrides).toBe(false);
  });

  it("rejects non-object manifest", () => {
    const { errors } = validateManifest("bad");
    expect(errors[0]).toContain("must be a JSON object");
  });

  it("rejects missing connectors key", () => {
    const { errors } = validateManifest({});
    expect(errors[0]).toContain("must be an array");
  });

  it("detects duplicate entries", () => {
    const { errors } = validateManifest({
      connectors: [
        { package: "@myorg/mongodb" },
        { package: "@myorg/mongodb" },
      ],
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("duplicate");
  });
});

describe("renderSource", () => {
  it("renders empty array for no entries", () => {
    const source = renderSource([]);
    expect(source).toContain("EXTERNAL_CONNECTORS: ExternalConnectorEntry[] = []");
  });

  it("renders import for default export", () => {
    const source = renderSource([
      { package: "@myorg/mongodb", export: "default", overrides: false },
    ]);
    expect(source).toContain('import externalConnector0 from "@myorg/mongodb"');
    expect(source).toContain("plugin: externalConnector0");
    expect(source).toContain("overrides: false");
  });

  it("renders import for named export", () => {
    const source = renderSource([
      { package: "@myorg/mongodb", export: "plugin", overrides: true },
    ]);
    expect(source).toContain(
      '{ plugin as externalConnector0 } from "@myorg/mongodb"',
    );
    expect(source).toContain("overrides: true");
  });

  it("renders ConnectorPlugin type reference", () => {
    const source = renderSource([]);
    expect(source).toContain("ConnectorPlugin");
  });
});

// #2062 — only the root `npm run build` picked a connector up from the
// manifest. The generated file is `connection` source and the app imports
// `connection/dist`, so connection's own build regenerates it, and app's own
// dev and build compile the SDK and connection before the app. Every entry
// point that builds or serves the app goes through one of those two scripts.
// The Docker build stage is pinned in build-guards.test.mjs.
describe("every entry point regenerates the connector list (#2062)", () => {
  const scripts = (pkg) =>
    JSON.parse(readFileSync(join(ROOT, pkg, "package.json"), "utf8")).scripts;
  const SDK_BUILD = "npm --prefix ../connector-sdk run build";
  const CONNECTION_BUILD = "npm --prefix ../connection run build";

  it("connection's build runs the codegen before compiling", () => {
    expect(scripts("connection").prebuild).toBe(`node ../scripts/${CODEGEN}`);
  });

  it("the codegen reads the manifest beside scripts/, not in its cwd", () => {
    // prebuild starts it from connection/. A cwd-relative lookup finds no
    // manifest there and writes the empty list, exit 0, so the probe is a
    // manifest that must fail: one listing a package that is not installed.
    const res = runCodegen([{ package: "@neoboard-test/not-installed-2062" }]);
    expect(res.status, res.stdout).toBe(1);
    expect(res.stderr).toContain("is not installed");
  });

  it("app's dev and build both compile the SDK, then connection", () => {
    // connection's types resolve @neoboard/connector-sdk from its dist, and
    // its tsconfig has noEmitOnError: a stale SDK dist after a pull fails the
    // connection build, so the SDK is built first, as the root build did.
    const app = scripts("app");
    expect(app.predev).toBe(app.prebuild);
    const sdk = app.prebuild.indexOf(SDK_BUILD);
    expect(sdk).toBeGreaterThan(-1);
    expect(app.prebuild.indexOf(CONNECTION_BUILD)).toBeGreaterThan(sdk);
  });

  it("root dev goes through app's dev without a second codegen run", () => {
    const root = scripts(".");
    expect(root.dev).toBe("npm -w app run dev");
    expect(root.predev ?? "").not.toContain(CODEGEN);
  });

  it("root build goes through app's build, compiling nothing twice", () => {
    const root = scripts(".");
    expect(root.build).toBe("npm -w app run build");
    expect(root.prebuild).toBeUndefined();
  });

  it("the E2E server is built through app's build script, so prebuild runs", () => {
    // `npx next build` skips every npm lifecycle script: local E2E served an
    // app compiled against whatever connection/dist was lying around.
    const setup = readFileSync(join(ROOT, "app/e2e/global-setup.ts"), "utf8");
    expect(setup).toContain('execSync("npm run build"');
    expect(setup).not.toContain("npx next build");
  });
});

// #2064 — the installed check resolved each package with CommonJS. A package
// whose exports map has only an `import` condition, the layout the SDK itself
// ships, threw ERR_PACKAGE_PATH_NOT_EXPORTED there and was reported as not
// installed, failing the build. The generated file is an ES module, so the
// check resolves the way its `import` does.
describe("the installed check resolves as the generated import does (#2064)", () => {
  it("accepts a package whose exports map has only an import condition", () => {
    const res = runCodegen([{ package: "@neoboard-test/esm-only-2064" }], {
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
      'import externalConnector0 from "@neoboard-test/esm-only-2064";',
    );
  });

  it("accepts a package with main and no exports map", () => {
    const res = runCodegen([{ package: "@neoboard-test/main-only-2064" }], {
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
      'import externalConnector0 from "@neoboard-test/main-only-2064";',
    );
  });

  // import.meta.resolve returns a URL, not a throw, for a target it cannot
  // find on disk, so the check must confirm the file exists itself.
  it("rejects an import-only package whose exports target is not built", () => {
    const res = runCodegen([{ package: "@neoboard-test/unbuilt-2064" }], {
      "@neoboard-test/unbuilt-2064": {
        "package.json": JSON.stringify({
          name: "@neoboard-test/unbuilt-2064",
          type: "module",
          exports: { ".": { import: "./dist/index.js" } },
        }),
      },
    });
    expect(res.status, res.stdout).toBe(1);
    expect(res.stderr).toContain(
      'Package "@neoboard-test/unbuilt-2064" is not installed.',
    );
    expect(res.generated).toBeNull();
  });

  it("rejects a relative entry that points at nothing", () => {
    const res = runCodegen([{ package: "../neoboard-connector-missing-2064" }]);
    expect(res.status, res.stdout).toBe(1);
    expect(res.stderr).toContain(
      'Package "../neoboard-connector-missing-2064" is not installed.',
    );
    expect(res.generated).toBeNull();
  });

  it("rejects a package that is not installed with the install hint", () => {
    const res = runCodegen([{ package: "@neoboard-test/not-installed-2064" }]);
    expect(res.status, res.stdout).toBe(1);
    expect(res.stderr).toContain(
      'Package "@neoboard-test/not-installed-2064" is not installed. Run: npm install @neoboard-test/not-installed-2064',
    );
    expect(res.generated).toBeNull();
  });
});
