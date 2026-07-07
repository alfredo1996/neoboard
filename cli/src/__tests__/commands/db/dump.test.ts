import { describe, it, expect, vi, beforeEach } from "vitest";

// pg_dump now streams stdout straight to a file descriptor via spawnSync (no
// shell, no 1 MiB execSync maxBuffer). Mock child_process + the fs handles.
vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(() => ({ status: 0, stderr: Buffer.from("") })),
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
  openSync: vi.fn(() => 3),
  closeSync: vi.fn(),
  statSync: vi.fn(() => ({ size: 2048 })),
}));

import { spawnSync } from "node:child_process";
import { getMode, readProjectConfig } from "../../../lib/config.js";
import { error as logError } from "../../../lib/output.js";
import { openSync, closeSync } from "node:fs";
import { runDbDump } from "../../../commands/db/dump.js";

const mockSpawnSync = vi.mocked(spawnSync);
const mockGetMode = vi.mocked(getMode);
const mockOpenSync = vi.mocked(openSync);
const mockCloseSync = vi.mocked(closeSync);
const mockReadProjectConfig = vi.mocked(readProjectConfig);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetMode.mockReturnValue("docker");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockSpawnSync.mockReturnValue({ status: 0, stderr: Buffer.from("") } as any);
  mockOpenSync.mockReturnValue(3);
  process.exitCode = 0;
});

describe("runDbDump", () => {
  it("dumps via docker exec in docker mode", async () => {
    await runDbDump({});
    expect(mockSpawnSync).toHaveBeenCalledWith(
      "docker",
      expect.arrayContaining(["exec", "neoboard-postgres", "pg_dump"]),
      expect.objectContaining({ stdio: ["ignore", 3, "pipe"] }),
    );
  });

  it("dumps via local pg_dump in local mode", async () => {
    mockGetMode.mockReturnValue("local");
    await runDbDump({});
    expect(mockSpawnSync).toHaveBeenCalledWith(
      "pg_dump",
      expect.arrayContaining(["-h", "localhost"]),
      expect.any(Object),
    );
  });

  it("streams to the custom output path (no shell)", async () => {
    await runDbDump({ output: "/tmp/backup.sql" });
    expect(mockOpenSync).toHaveBeenCalledWith("/tmp/backup.sql", "w");
    expect(mockCloseSync).toHaveBeenCalledWith(3);
  });

  it("generates a timestamped default filename", async () => {
    await runDbDump({});
    const path = mockOpenSync.mock.calls[0][0] as string;
    expect(path).toMatch(
      /neoboard-dump-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.sql$/,
    );
  });

  it("passes the --data-only flag", async () => {
    await runDbDump({ dataOnly: true });
    expect(mockSpawnSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(["--data-only"]),
      expect.any(Object),
    );
  });

  it("closes the fd even when pg_dump fails, and reports stderr", async () => {
    mockSpawnSync.mockReturnValue({
      status: 1,
      stderr: Buffer.from("pg_dump: connection refused"),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    await runDbDump({});
    expect(mockCloseSync).toHaveBeenCalledWith(3);
    expect(logError).toHaveBeenCalledWith("pg_dump: connection refused");
    expect(process.exitCode).toBe(1);
  });

  it("sets exitCode=1 when the output file can't be opened", async () => {
    mockOpenSync.mockImplementationOnce(() => {
      throw new Error("ENOSPC: no space left");
    });
    await runDbDump({});
    expect(logError).toHaveBeenCalledWith("ENOSPC: no space left");
    expect(process.exitCode).toBe(1);
  });

  it("rejects unsafe postgres.user before spawning", async () => {
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
    expect(mockSpawnSync).not.toHaveBeenCalled();
  });
});
