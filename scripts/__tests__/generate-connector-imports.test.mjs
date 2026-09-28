import { describe, it, expect } from "vitest";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateEntry,
  validateManifest,
  renderSource,
} from "../generate-connector-imports.mjs";

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
  const ROOT = fileURLToPath(new URL("../..", import.meta.url));
  const scripts = (pkg) =>
    JSON.parse(readFileSync(join(ROOT, pkg, "package.json"), "utf8")).scripts;
  const CODEGEN = "generate-connector-imports.mjs";
  const SDK_BUILD = "npm --prefix ../connector-sdk run build";
  const CONNECTION_BUILD = "npm --prefix ../connection run build";

  it("connection's build runs the codegen before compiling", () => {
    expect(scripts("connection").prebuild).toBe(`node ../scripts/${CODEGEN}`);
  });

  it("the codegen reads the manifest beside scripts/, not in its cwd", () => {
    // prebuild starts it from connection/. A cwd-relative lookup finds no
    // manifest there and writes the empty list, exit 0, so the probe is a
    // manifest that must fail: one listing a package that is not installed.
    // A copy in a temp tree keeps the checkout's generated file untouched.
    const tmp = mkdtempSync(join(tmpdir(), "codegen-2062-"));
    try {
      mkdirSync(join(tmp, "scripts"));
      mkdirSync(join(tmp, "connection", "src"), { recursive: true });
      copyFileSync(
        join(ROOT, "scripts", CODEGEN),
        join(tmp, "scripts", CODEGEN),
      );
      writeFileSync(
        join(tmp, "neoboard-connectors.json"),
        JSON.stringify({
          connectors: [{ package: "@neoboard-test/not-installed-2062" }],
        }),
      );
      const res = spawnSync(process.execPath, [`../scripts/${CODEGEN}`], {
        cwd: join(tmp, "connection"),
        encoding: "utf8",
      });
      expect(res.status, res.stdout).toBe(1);
      expect(res.stderr).toContain("is not installed");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
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
