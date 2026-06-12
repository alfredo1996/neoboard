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
  getMode: vi.fn(() => "docker"),
  readProjectConfig: vi.fn(() => ({
    neo4j: { user: "neo4j", password: "neoboard123" },
    postgres: { user: "neoboard", password: "neoboard", database: "neoboard" },
    ports: { app: 3000, postgres: 5432, neo4j_http: 7474, neo4j_bolt: 7687 },
    seed: {
      script: "scripts/seed-demo.mjs",
      neo4j_cypher: "docker/neo4j/init.cypher",
    },
  })),
}));

// seedPostgres delegates env construction to buildSeedEnv; the env-content
// logic is unit-tested in docker-env.test.ts. Here we assert delegation.
vi.mock("../../../lib/docker-env.js", () => ({
  buildSeedEnv: vi.fn(() => ({ SEED_ENV: "from-buildSeedEnv" })),
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
import { buildSeedEnv } from "../../../lib/docker-env.js";
import {
  seedNeo4j,
  seedPostgres,
  runDbSeed,
} from "../../../commands/db/seed.js";

const mockRun = vi.mocked(run);
const mockDockerExec = vi.mocked(dockerExec);
const mockBuildSeedEnv = vi.mocked(buildSeedEnv);

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
      expect.objectContaining({
        env: { NEO4J_USERNAME: "neo4j", NEO4J_PASSWORD: "neoboard123" },
      }),
    );
  });

  it("never puts the Neo4j password in the command line (#967)", async () => {
    mockDockerExec.mockReturnValueOnce("c\n0");
    mockDockerExec.mockReturnValueOnce("ok");

    await seedNeo4j();
    for (const call of mockDockerExec.mock.calls) {
      expect(String(call[1])).not.toContain("neoboard123");
      expect(String(call[1])).not.toMatch(/-p\s/);
    }
  });

  it("skips when database has nodes", async () => {
    mockDockerExec.mockReturnValue("c\n42");
    await seedNeo4j();
    // Only the count query, no seed
    expect(mockDockerExec).toHaveBeenCalledTimes(1);
  });
});

describe("seedPostgres", () => {
  it("runs the seed script with the environment from buildSeedEnv (#1039)", async () => {
    await seedPostgres();
    expect(mockBuildSeedEnv).toHaveBeenCalledOnce();
    expect(mockRun).toHaveBeenCalledWith(
      "node /project/scripts/seed-demo.mjs",
      { cwd: "/project", env: { SEED_ENV: "from-buildSeedEnv" } },
    );
  });

  it("takes no dockerNetwork argument — docker vs local is derived inside buildSeedEnv", () => {
    // Regression guard for #1039: the old signature let callers (db seed,
    // db reset) forget the flag and silently skip the encryption key.
    expect(seedPostgres.length).toBe(0);
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

  it("routes the PG seed through buildSeedEnv so db seed / db reset get the key (#1039)", async () => {
    await runDbSeed({ demo: true });
    expect(mockBuildSeedEnv).toHaveBeenCalledOnce();
    const env = mockRun.mock.calls[0]?.[1]?.env;
    expect(env).toEqual({ SEED_ENV: "from-buildSeedEnv" });
  });
});
