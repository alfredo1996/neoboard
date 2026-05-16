import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/config.js", () => ({
  findProjectRoot: vi.fn(() => "/project"),
}));

vi.mock("../../lib/exec.js", () => ({
  run: vi.fn(),
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

import { run } from "../../lib/exec.js";
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

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = 0;
  mockReadManifest.mockReturnValue([]);
  mockAddToManifest.mockReturnValue(true);
  mockRemoveFromManifest.mockReturnValue(true);

  // Reset module-level mocks for dynamic imports
  vi.doMock(CHART_PKG, () => ({
    default: {
      type: "fake-chart",
      label: "Fake Chart",
      compatibleWith: ["neo4j"],
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

describe("runPluginAdd", () => {
  it("installs, validates, and registers a chart plugin", async () => {
    mockValidate.mockReturnValue({
      valid: true,
      errors: [],
      pluginType: "chart",
    });

    await runPluginAdd(CHART_PKG);

    // npm install + codegen invoked
    expect(mockRun).toHaveBeenCalledWith("npm install " + CHART_PKG, {
      cwd: "/project",
    });
    expect(mockRun).toHaveBeenCalledWith(
      "node scripts/generate-plugin-imports.mjs",
      { cwd: "/project" },
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

  it("registers a connector plugin under connectors manifest + connector codegen", async () => {
    mockValidate.mockReturnValue({
      valid: true,
      errors: [],
      pluginType: "connector",
    });

    await runPluginAdd(CONN_PKG);

    expect(mockRun).toHaveBeenCalledWith(
      "node scripts/generate-connector-imports.mjs",
      { cwd: "/project" },
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
    vi.doMock(CHART_PKG, () => ({
      myExport: {
        type: "fake-chart",
        label: "Fake",
        compatibleWith: ["neo4j"],
        transform: () => ({}),
      },
    }));
    mockValidate.mockReturnValue({
      valid: true,
      errors: [],
      pluginType: "chart",
    });

    await runPluginAdd(CHART_PKG, { export: "myExport" });

    const [, , entry] = mockAddToManifest.mock.calls[0];
    expect(entry).toEqual({ package: CHART_PKG, export: "myExport" });
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
    mockRun.mockImplementationOnce(() => {
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
    expect(mockRun).toHaveBeenCalledWith(
      expect.stringContaining("npm uninstall " + BROKEN_PKG),
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

  it("warns (does not fail) when codegen exits non-zero", async () => {
    mockValidate.mockReturnValue({
      valid: true,
      errors: [],
      pluginType: "chart",
    });
    // First call (npm install) OK, second (codegen) throws
    mockRun
      .mockImplementationOnce(() => "")
      .mockImplementationOnce(() => {
        throw new Error("codegen broke");
      });

    await runPluginAdd(CHART_PKG);

    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining("Codegen script failed"),
    );
    expect(mockSuccess).toHaveBeenCalled();
  });
});

describe("runPluginList", () => {
  it("prints both built-in and external charts/connectors with counts", () => {
    mockReadManifest.mockImplementation((path) => {
      if (path.includes("neoboard-plugins.json")) {
        return [{ package: "ext-chart-pkg" }];
      }
      if (path.includes("neoboard-connectors.json")) {
        return [{ package: "ext-conn-pkg", overrides: true }];
      }
      return [];
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      runPluginList();

      expect(mockInfo).toHaveBeenCalledWith(
        expect.stringMatching(/Charts \(\d+ built-in, 1 external\)/),
      );
      expect(mockInfo).toHaveBeenCalledWith(
        expect.stringMatching(/Connectors \(2 built-in, 1 external\)/),
      );

      const logs = logSpy.mock.calls.map((c) => c[0] as string).join("\n");
      expect(logs).toContain("ext-chart-pkg");
      expect(logs).toContain("ext-conn-pkg");
      expect(logs).toContain("(overrides)");
      // A built-in is rendered too
      expect(logs).toContain("bar");
      expect(logs).toContain("neo4j");
    } finally {
      logSpy.mockRestore();
    }
  });
});

describe("runPluginRemove", () => {
  it("removes a chart plugin and runs chart codegen + npm uninstall", async () => {
    // First call (plugins manifest) removes successfully
    mockRemoveFromManifest.mockReturnValueOnce(true);

    await runPluginRemove(CHART_PKG);

    const [path, key, name] = mockRemoveFromManifest.mock.calls[0];
    expect(path).toContain("neoboard-plugins.json");
    expect(key).toBe("plugins");
    expect(name).toBe(CHART_PKG);

    expect(mockRun).toHaveBeenCalledWith(
      "node scripts/generate-plugin-imports.mjs",
      { cwd: "/project" },
    );
    expect(mockRun).toHaveBeenCalledWith("npm uninstall " + CHART_PKG, {
      cwd: "/project",
    });
    expect(mockSuccess).toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
  });

  it("falls back to connectors manifest when not in plugins manifest", async () => {
    mockRemoveFromManifest
      .mockReturnValueOnce(false) // plugins: miss
      .mockReturnValueOnce(true); // connectors: hit

    await runPluginRemove(CONN_PKG);

    expect(mockRemoveFromManifest).toHaveBeenCalledTimes(2);
    expect(mockRun).toHaveBeenCalledWith(
      "node scripts/generate-connector-imports.mjs",
      { cwd: "/project" },
    );
    expect(mockSuccess).toHaveBeenCalled();
  });

  it("errors and exits 1 when the package is not in either manifest", async () => {
    mockRemoveFromManifest.mockReturnValue(false);

    await runPluginRemove("never-installed");

    expect(mockError).toHaveBeenCalledWith(
      expect.stringContaining("not registered as an external plugin"),
    );
    expect(mockRun).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("warns but still succeeds when npm uninstall fails after manifest removal", async () => {
    mockRemoveFromManifest.mockReturnValueOnce(true);
    // First run = codegen OK; second run (npm uninstall) throws
    mockRun
      .mockImplementationOnce(() => "")
      .mockImplementationOnce(() => {
        throw new Error("npm uninstall failed");
      });

    await runPluginRemove(CHART_PKG);

    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining("npm uninstall failed"),
    );
    expect(mockSuccess).toHaveBeenCalled();
  });
});
