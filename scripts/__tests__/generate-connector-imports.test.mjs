import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateEntry,
  validateManifest,
  renderSource,
} from "../generate-connector-imports.mjs";
import {
  CONNECTOR_CODEGEN,
  describeInstalledCheck,
  runCodegen,
} from "./codegen-harness.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const CODEGEN = CONNECTOR_CODEGEN.file;

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

// #2067 — next.config.ts named the built-ins' drivers, so any other
// connector's driver was bundled into the server. Each declares its own now.
describe("the codegen collects the connectors' server-external packages (#2067)", () => {
  const run = (serverExternalPackages) =>
    runCodegen([{ package: "@neoboard-test/kv-2067" }], {
      "@neoboard-test/kv-2067": {
        "package.json": JSON.stringify({
          name: "@neoboard-test/kv-2067",
          main: "index.js",
          neoboard: { serverExternalPackages },
        }),
        "index.js": "module.exports = {};\n",
      },
    });

  it("lists the built-ins' packages, then an external connector's, once each", () => {
    const res = run(["kv-driver-2067", "pg"]);
    expect(res.status, res.stderr).toBe(0);
    expect(res.externals).toEqual([
      "pg",
      "neo4j-driver",
      "neo4j-driver-core",
      "kv-driver-2067",
    ]);
  });

  it.each([
    ["a string", "kv-driver-2067"],
    ["a name with a space", ["kv driver"]],
  ])("rejects a declaration that is %s", (_, declared) => {
    const res = run(declared);
    expect(res.status, res.stdout).toBe(1);
    expect(res.stderr).toContain(
      "@neoboard-test/kv-2067: neoboard.serverExternalPackages must be an array of package names",
    );
    expect(res.externals).toBeNull();
  });
});

describeInstalledCheck(CONNECTOR_CODEGEN);

// The shared helper's own edges. Both codegens import it (the guard above, run
// in each codegen's suite), so one codegen covers them.
describe("the installed check confirms the resolved file exists (#2064)", () => {
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
});
