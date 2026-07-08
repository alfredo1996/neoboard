import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(
    () =>
      "DATABASE_URL=postgresql://neoboard:neoboard@localhost:5432/neoboard\n",
  ),
}));

vi.mock("../../../lib/exec.js", () => ({
  run: vi.fn(),
  dockerExec: vi.fn(),
}));

vi.mock("../../../lib/config.js", () => ({
  paths: { envFile: "/project/app/.env.local" },
  readProjectConfig: vi.fn(() => ({
    postgres: { user: "neoboard", password: "neoboard", database: "neoboard" },
  })),
  getMode: vi.fn(() => "docker"),
}));

vi.mock("../../../lib/output.js", () => ({
  info: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  createSpinner: vi.fn(() => ({
    start: vi.fn(),
    succeed: vi.fn(),
    fail: vi.fn(),
  })),
}));

vi.mock("../../../lib/prompt.js", () => ({
  confirm: vi.fn(async () => true),
}));

vi.mock("../../../commands/db/migrate.js", () => ({
  runDbMigrate: vi.fn(),
}));

vi.mock("../../../commands/db/seed.js", () => ({
  runDbSeed: vi.fn(),
}));

import { readFileSync } from "node:fs";
import { run, dockerExec } from "../../../lib/exec.js";
import { getMode } from "../../../lib/config.js";
import { error as logError } from "../../../lib/output.js";
import { confirm } from "../../../lib/prompt.js";
import { runDbMigrate } from "../../../commands/db/migrate.js";
import { runDbSeed } from "../../../commands/db/seed.js";
import { runDbReset } from "../../../commands/db/reset.js";

const mockReadFileSync = vi.mocked(readFileSync);
const mockRun = vi.mocked(run);
const mockDockerExec = vi.mocked(dockerExec);
const mockGetMode = vi.mocked(getMode);
const mockConfirm = vi.mocked(confirm);
const mockRunDbMigrate = vi.mocked(runDbMigrate);
const mockRunDbSeed = vi.mocked(runDbSeed);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetMode.mockReturnValue("docker");
  mockConfirm.mockResolvedValue(true);
  // Migrations succeed by default; reset now skips the seed when they fail.
  mockRunDbMigrate.mockResolvedValue(true);
  mockReadFileSync.mockReturnValue(
    "DATABASE_URL=postgresql://neoboard:neoboard@localhost:5432/neoboard\n",
  );
  process.exitCode = undefined;
});

describe("runDbReset", () => {
  it("refuses on non-localhost DATABASE_URL", async () => {
    mockReadFileSync.mockReturnValue(
      "DATABASE_URL=postgresql://neoboard:neoboard@prod-db.example.com:5432/neoboard\n",
    );
    await runDbReset();
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining("prod-db.example.com"),
    );
    expect(mockDockerExec).not.toHaveBeenCalled();
  });

  it("prompts for confirmation", async () => {
    await runDbReset();
    expect(mockConfirm).toHaveBeenCalledWith(expect.stringContaining("DROP"));
  });

  it("aborts when user declines", async () => {
    mockConfirm.mockResolvedValue(false);
    await runDbReset();
    expect(mockDockerExec).not.toHaveBeenCalled();
  });

  it("skips confirmation with --force", async () => {
    await runDbReset({ force: true });
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockDockerExec).toHaveBeenCalled();
  });

  it("drops and creates database in docker mode", async () => {
    await runDbReset({ force: true });
    expect(mockDockerExec).toHaveBeenCalledWith(
      "neoboard-postgres",
      expect.stringContaining("DROP DATABASE"),
    );
    expect(mockDockerExec).toHaveBeenCalledWith(
      "neoboard-postgres",
      expect.stringContaining("CREATE DATABASE"),
    );
  });

  it("uses local psql in local mode", async () => {
    mockGetMode.mockReturnValue("local");
    await runDbReset({ force: true });
    expect(mockRun).toHaveBeenCalledWith(
      expect.stringContaining("psql -h localhost"),
    );
  });

  it("replays migrations after reset", async () => {
    await runDbReset({ force: true });
    expect(mockRunDbMigrate).toHaveBeenCalledWith({});
  });

  it("seeds after migration by default", async () => {
    await runDbReset({ force: true });
    expect(mockRunDbSeed).toHaveBeenCalled();
  });

  it("skips seed with --no-seed", async () => {
    await runDbReset({ force: true, noSeed: true });
    expect(mockRunDbSeed).not.toHaveBeenCalled();
  });

  it("does NOT seed when migrations fail (#MEDIUM)", async () => {
    mockRunDbMigrate.mockResolvedValue(false);
    await runDbReset({ force: true });
    expect(mockRunDbSeed).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
