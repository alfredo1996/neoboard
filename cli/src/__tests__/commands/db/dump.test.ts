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
  error: vi.fn(),
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
import { getMode, readProjectConfig } from "../../../lib/config.js";
import { error as logError } from "../../../lib/output.js";
import { writeFileSync } from "node:fs";
import { runDbDump } from "../../../commands/db/dump.js";

const mockRun = vi.mocked(run);
const mockGetMode = vi.mocked(getMode);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockReadProjectConfig = vi.mocked(readProjectConfig);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetMode.mockReturnValue("docker");
  process.exitCode = 0;
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

  it("calls spinner.fail, logs error, and sets exitCode=1 when run throws", async () => {
    mockRun.mockImplementationOnce(() => {
      throw new Error("pg_dump failed");
    });
    await runDbDump({});
    expect(logError).toHaveBeenCalledWith("pg_dump failed");
    expect(process.exitCode).toBe(1);
  });

  it("calls spinner.fail and sets exitCode=1 when writeFileSync throws", async () => {
    mockWriteFileSync.mockImplementationOnce(() => {
      throw new Error("ENOSPC: no space left");
    });
    await runDbDump({});
    expect(logError).toHaveBeenCalledWith("ENOSPC: no space left");
    expect(process.exitCode).toBe(1);
  });

  it("rejects unsafe postgres.user and sets exitCode=1", async () => {
    mockReadProjectConfig.mockReturnValueOnce({
      ports: { app: 3000, postgres: 5432, neo4j_http: 7474, neo4j_bolt: 7687 },
      postgres: {
        user: "bad;user",
        password: "neoboard",
        database: "neoboard",
      },
      neo4j: { user: "neo4j", password: "password" },
      seed: { script: "scripts/seed.mjs", neo4j_cypher: "" },
    });
    await runDbDump({});
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining("Unsafe characters"),
    );
    expect(process.exitCode).toBe(1);
    expect(mockRun).not.toHaveBeenCalled();
  });
});
