import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../lib/exec.js", () => ({
  run: vi.fn(() => "-- SQL dump"),
}));

vi.mock("../../../lib/config.js", () => ({
  paths: { root: "/project" },
  readProjectConfig: vi.fn(() => ({
    ports: { postgres: 5432 },
    postgres: { user: "neoboard", password: "neoboard", database: "neoboard" },
  })),
  getMode: vi.fn(() => "docker"),
}));

vi.mock("../../../lib/output.js", () => ({
  success: vi.fn(),
  createSpinner: vi.fn(() => ({
    start: vi.fn(),
    succeed: vi.fn(),
    fail: vi.fn(),
  })),
}));

vi.mock("node:fs", () => ({
  writeFileSync: vi.fn(),
  statSync: vi.fn(() => ({ size: 2048 })),
}));

import { run } from "../../../lib/exec.js";
import { getMode } from "../../../lib/config.js";
import { writeFileSync } from "node:fs";
import { runDbDump } from "../../../commands/db/dump.js";

const mockRun = vi.mocked(run);
const mockGetMode = vi.mocked(getMode);
const mockWriteFileSync = vi.mocked(writeFileSync);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetMode.mockReturnValue("docker");
});

describe("runDbDump", () => {
  it("dumps via docker exec in docker mode", async () => {
    await runDbDump({});
    expect(mockRun).toHaveBeenCalledWith(
      expect.stringContaining("docker exec neoboard-postgres pg_dump"),
    );
  });

  it("dumps via local pg_dump in local mode", async () => {
    mockGetMode.mockReturnValue("local");
    await runDbDump({});
    expect(mockRun).toHaveBeenCalledWith(
      expect.stringContaining("pg_dump -h localhost"),
    );
  });

  it("uses custom output path", async () => {
    await runDbDump({ output: "/tmp/backup.sql" });
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      "/tmp/backup.sql",
      "-- SQL dump",
    );
  });

  it("generates timestamped default filename", async () => {
    await runDbDump({});
    const path = mockWriteFileSync.mock.calls[0][0] as string;
    expect(path).toMatch(
      /neoboard-dump-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.sql$/,
    );
  });

  it("passes --data-only flag", async () => {
    await runDbDump({ dataOnly: true });
    expect(mockRun).toHaveBeenCalledWith(
      expect.stringContaining("--data-only"),
    );
  });

  it("writes sql output to file", async () => {
    await runDbDump({});
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.any(String),
      "-- SQL dump",
    );
  });
});
