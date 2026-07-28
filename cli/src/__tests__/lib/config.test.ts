import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  findProjectRoot,
  readProjectConfig,
  readLocalConfig,
  writeLocalConfig,
  _setRootForTesting,
} from "../../lib/config.js";

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);

beforeEach(() => {
  vi.clearAllMocks();
  _setRootForTesting(null);
});

describe("findProjectRoot", () => {
  it("finds root when package.json has name neoboard", () => {
    mockExistsSync.mockImplementation((p) => {
      return p === "/projects/neoboard/package.json";
    });
    mockReadFileSync.mockReturnValue(JSON.stringify({ name: "neoboard" }));
    expect(findProjectRoot("/projects/neoboard/cli/src")).toBe(
      "/projects/neoboard",
    );
  });

  it("walks up directories until found", () => {
    mockExistsSync.mockImplementation((p) => {
      return (
        p === "/a/b/c/package.json" ||
        p === "/a/b/package.json" ||
        p === "/a/package.json"
      );
    });
    mockReadFileSync.mockImplementation((p) => {
      if (p === "/a/package.json") return JSON.stringify({ name: "neoboard" });
      return JSON.stringify({ name: "other" });
    });
    expect(findProjectRoot("/a/b/c")).toBe("/a");
  });

  it("returns null when no project root is found", () => {
    // Was `toThrow`. Changed deliberately in #1315: under `npx`, the CLI lives
    // in an npm cache directory with no monorepo above it, and throwing this
    // deep in a path helper surfaced as an unrelated-looking crash. Absence is
    // a normal state now; only the caller knows whether it is a problem.
    mockExistsSync.mockReturnValue(false);
    expect(findProjectRoot("/nowhere")).toBeNull();
  });

  it("terminates instead of looping when run from a Windows drive root (#991)", () => {
    // dirname("C:\\") === "C:\\" — the old `while (dir !== "/")` loop
    // never terminated. The fixed loop stops when dirname stops changing.
    //
    // Returning null still proves termination: a non-terminating loop would
    // hang the test rather than return anything. The assertion changed with
    // #1315; what it protects did not.
    mockExistsSync.mockReturnValue(false);
    expect(findProjectRoot("C:\\")).toBeNull();
  });
});

describe("readProjectConfig", () => {
  beforeEach(() => {
    _setRootForTesting("/project");
  });

  it("returns default config when file missing", () => {
    mockExistsSync.mockReturnValue(false);
    const config = readProjectConfig();
    expect(config.ports.app).toBe(3000);
    expect(config.postgres.user).toBe("neoboard");
    expect(config.neo4j.user).toBe("neo4j");
  });

  it("parses config from file", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        ports: { app: 4000, postgres: 5433, neo4j_http: 7475, neo4j_bolt: 7688 },
        postgres: { user: "custom", password: "pass", database: "mydb" },
        neo4j: { user: "admin", password: "secret" },
        seed: { script: "seed.mjs", neo4j_cypher: "init.cypher" },
      }),
    );
    const config = readProjectConfig();
    expect(config.ports.app).toBe(4000);
    expect(config.postgres.user).toBe("custom");
  });

  it("returns default on invalid json", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("not json");
    const config = readProjectConfig();
    expect(config.ports.app).toBe(3000);
  });
});

describe("readLocalConfig", () => {
  beforeEach(() => {
    _setRootForTesting("/project");
  });

  it("returns default config when file missing", () => {
    mockExistsSync.mockReturnValue(false);
    const config = readLocalConfig();
    expect(config.mode).toBe("docker");
  });

  it("parses local config from file", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ mode: "local" }));
    const config = readLocalConfig();
    expect(config.mode).toBe("local");
  });
});

describe("writeLocalConfig", () => {
  it("writes config as formatted json", () => {
    _setRootForTesting("/project");
    writeLocalConfig({ mode: "local" });
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining(".neoboard.local"),
      JSON.stringify({ mode: "local" }, null, 2) + "\n",
    );
  });
});
