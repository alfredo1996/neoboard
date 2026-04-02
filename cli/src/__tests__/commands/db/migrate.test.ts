import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../lib/exec.js", () => ({
  run: vi.fn(),
}));

vi.mock("../../../lib/docker.js", () => ({
  dockerExec: vi.fn(),
}));

vi.mock("../../../lib/config.js", () => ({
  paths: {
    journalPath: "/project/app/drizzle/migrations/meta/_journal.json",
    appDir: "/project/app",
  },
  getMode: vi.fn(() => "local"),
}));

vi.mock("../../../lib/output.js", () => ({
  info: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
  createSpinner: vi.fn(() => ({
    start: vi.fn(),
    succeed: vi.fn(),
    fail: vi.fn(),
  })),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

import { run } from "../../../lib/exec.js";
import { dockerExec } from "../../../lib/docker.js";
import { getMode } from "../../../lib/config.js";
import { info, warn } from "../../../lib/output.js";
import { existsSync, readFileSync } from "node:fs";
import {
  showMigrationStatus,
  showDryRun,
  runDbMigrate,
} from "../../../commands/db/migrate.js";

const mockRun = vi.mocked(run);
const mockDockerExec = vi.mocked(dockerExec);
const mockGetMode = vi.mocked(getMode);
const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);

const SAMPLE_JOURNAL = JSON.stringify({
  version: "7",
  entries: [
    { idx: 0, tag: "0000_wooden_zeigeist", when: 1700000000000 },
    { idx: 1, tag: "0001_rapid_iron_monger", when: 1700100000000 },
  ],
});

beforeEach(() => {
  vi.clearAllMocks();
  mockGetMode.mockReturnValue("local");
});

describe("showMigrationStatus", () => {
  it("displays migration entries", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(SAMPLE_JOURNAL);
    showMigrationStatus();
    expect(info).toHaveBeenCalledWith("Migrations: 2 available");
  });

  it("warns when no journal found", () => {
    mockExistsSync.mockReturnValue(false);
    showMigrationStatus();
    expect(warn).toHaveBeenCalledWith("No migration journal found.");
  });
});

describe("showDryRun", () => {
  it("shows pending migrations without applying", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(SAMPLE_JOURNAL);
    showDryRun();
    expect(info).toHaveBeenCalledWith("Would apply 2 migration(s):");
    expect(mockRun).not.toHaveBeenCalled();
  });
});

describe("runDbMigrate", () => {
  it("shows status when --status flag set", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(SAMPLE_JOURNAL);
    await runDbMigrate({ status: true });
    expect(info).toHaveBeenCalledWith("Migrations: 2 available");
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("shows dry run when --dry-run flag set", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(SAMPLE_JOURNAL);
    await runDbMigrate({ dryRun: true });
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("runs migrations in local mode", async () => {
    await runDbMigrate({});
    expect(mockRun).toHaveBeenCalledWith("npx drizzle-kit migrate", {
      cwd: "/project/app",
    });
  });

  it("runs migrations via docker exec in docker mode", async () => {
    mockGetMode.mockReturnValue("docker");
    await runDbMigrate({});
    expect(mockDockerExec).toHaveBeenCalledWith(
      "neoboard-app",
      "npx drizzle-kit migrate",
    );
  });

  it("prints backup warning", async () => {
    await runDbMigrate({});
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining("neoboard db dump"),
    );
  });

  it("warns about --to flag limitation", async () => {
    await runDbMigrate({ to: "1.0.0" });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("--to 1.0.0"));
  });
});
