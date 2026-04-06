import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, existsSync: vi.fn(() => true) };
});

vi.mock("../../../lib/exec.js", () => ({
  run: vi.fn(),
}));

vi.mock("../../../lib/docker.js", () => ({
  dockerExec: vi.fn(),
}));

vi.mock("../../../lib/config.js", () => ({
  paths: { root: "/project" },
  readProjectConfig: vi.fn(() => ({
    neo4j: { user: "neo4j", password: "neoboard123" },
    seed: {
      script: "scripts/seed-demo.mjs",
      neo4j_cypher: "docker/neo4j/init.cypher",
    },
  })),
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

import { run } from "../../../lib/exec.js";
import { dockerExec } from "../../../lib/docker.js";
import {
  seedNeo4j,
  seedPostgres,
  runDbSeed,
} from "../../../commands/db/seed.js";

const mockRun = vi.mocked(run);
const mockDockerExec = vi.mocked(dockerExec);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("seedNeo4j", () => {
  it("seeds when database is empty", async () => {
    // First call: count query returns 0
    mockDockerExec.mockReturnValueOnce("c\n0");
    // Second call: cypher-shell seed
    mockDockerExec.mockReturnValueOnce("ok");

    await seedNeo4j();
    expect(mockDockerExec).toHaveBeenCalledTimes(2);
    expect(mockDockerExec).toHaveBeenLastCalledWith(
      "neoboard-neo4j",
      expect.stringContaining("-f /var/lib/neo4j/import/init.cypher"),
    );
  });

  it("skips when database has nodes", async () => {
    mockDockerExec.mockReturnValue("c\n42");
    await seedNeo4j();
    // Only the count query, no seed
    expect(mockDockerExec).toHaveBeenCalledTimes(1);
  });
});

describe("seedPostgres", () => {
  it("runs seed script with host env", async () => {
    await seedPostgres();
    expect(mockRun).toHaveBeenCalledWith(
      "node /project/scripts/seed-demo.mjs",
      { cwd: "/project", env: process.env },
    );
  });

  it("passes Docker hostnames when dockerNetwork is true", async () => {
    await seedPostgres(true);
    expect(mockRun).toHaveBeenCalledWith(
      "node /project/scripts/seed-demo.mjs",
      {
        cwd: "/project",
        env: expect.objectContaining({
          NEO4J_HOST: "neoboard-neo4j",
          PG_HOST: "neoboard-postgres",
        }),
      },
    );
  });
});

describe("runDbSeed", () => {
  it("seeds both by default", async () => {
    mockDockerExec.mockReturnValue("c\n0");
    await runDbSeed();
    // Neo4j count + Neo4j seed + PG seed
    expect(mockDockerExec).toHaveBeenCalled();
    expect(mockRun).toHaveBeenCalled();
  });

  it("seeds only neo4j with --neo4j flag", async () => {
    mockDockerExec.mockReturnValue("c\n0");
    await runDbSeed({ neo4j: true });
    expect(mockDockerExec).toHaveBeenCalled();
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("seeds only postgres with --demo flag", async () => {
    await runDbSeed({ demo: true });
    expect(mockRun).toHaveBeenCalled();
    // No Neo4j exec calls
    expect(mockDockerExec).not.toHaveBeenCalled();
  });
});
