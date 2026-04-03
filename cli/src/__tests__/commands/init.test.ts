import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock("../../lib/exec.js", () => ({
  run: vi.fn(),
}));

vi.mock("../../lib/config.js", () => ({
  paths: {
    root: "/project",
    appDir: "/project/app",
    projectConfig: "/project/neoboard.config.json",
  },
  readProjectConfig: vi.fn(() => ({
    ports: { app: 3000, postgres: 5432, neo4j_http: 7474, neo4j_bolt: 7687 },
    postgres: { user: "neoboard", password: "neoboard", database: "neoboard" },
    neo4j: { user: "neo4j", password: "neoboard123" },
    seed: {
      script: "scripts/seed-demo.mjs",
      neo4j_cypher: "docker/neo4j/init.cypher",
    },
  })),
  writeLocalConfig: vi.fn(),
}));

vi.mock("../../lib/output.js", () => ({
  info: vi.fn(),
  success: vi.fn(),
  createSpinner: vi.fn(() => ({
    start: vi.fn(),
    succeed: vi.fn(),
  })),
}));

vi.mock("../../commands/env.js", () => ({
  generateEnvFile: vi.fn(),
}));

import { existsSync, writeFileSync } from "node:fs";
import { run } from "../../lib/exec.js";
import { writeLocalConfig } from "../../lib/config.js";
import { generateEnvFile } from "../../commands/env.js";
import { runInit } from "../../commands/init.js";

const mockExistsSync = vi.mocked(existsSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockRun = vi.mocked(run);
const mockWriteLocalConfig = vi.mocked(writeLocalConfig);
const mockGenerateEnvFile = vi.mocked(generateEnvFile);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runInit", () => {
  it("creates config files with docker mode by default", async () => {
    mockExistsSync.mockReturnValue(false);
    await runInit();
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      "/project/neoboard.config.json",
      expect.stringContaining('"ports"'),
    );
    expect(mockWriteLocalConfig).toHaveBeenCalledWith({ mode: "docker" });
  });

  it("skips config creation when already exists", async () => {
    mockExistsSync.mockReturnValue(true);
    await runInit();
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it("sets local mode when specified", async () => {
    mockExistsSync.mockReturnValue(false);
    await runInit({ mode: "local" });
    expect(mockWriteLocalConfig).toHaveBeenCalledWith({ mode: "local" });
  });

  it("installs deps in local mode", async () => {
    mockExistsSync.mockReturnValue(false);
    await runInit({ mode: "local" });
    expect(mockRun).toHaveBeenCalledWith("npm install", { cwd: "/project" });
    expect(mockRun).toHaveBeenCalledWith("npm install", {
      cwd: "/project/app",
    });
  });

  it("generates env file in local mode", async () => {
    mockExistsSync.mockReturnValue(false);
    await runInit({ mode: "local" });
    expect(mockGenerateEnvFile).toHaveBeenCalled();
  });

  it("does not install deps or generate env in docker mode", async () => {
    mockExistsSync.mockReturnValue(false);
    await runInit({ mode: "docker" });
    expect(mockRun).not.toHaveBeenCalled();
    expect(mockGenerateEnvFile).not.toHaveBeenCalled();
  });
});
