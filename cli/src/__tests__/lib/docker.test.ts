import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/exec.js", () => ({
  run: vi.fn(),
  runOrNull: vi.fn(),
  dockerExec: vi.fn(),
}));

vi.mock("../../lib/config.js", () => ({
  paths: {
    root: "/project",
    dockerDir: "/project/docker",
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
  getMode: vi.fn(() => "docker"),
}));

import {
  run,
  runOrNull,
  dockerExec as execInContainer,
} from "../../lib/exec.js";
import {
  isDockerRunning,
  isComposeV2,
  composeFile,
  composeUp,
  composeDown,
  composePs,
  dockerExec,
  isPgReady,
  isNeo4jReady,
} from "../../lib/docker.js";

const mockRun = vi.mocked(run);
const mockRunOrNull = vi.mocked(runOrNull);
const mockDockerExec = vi.mocked(execInContainer);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isDockerRunning", () => {
  it("returns true when docker info succeeds", () => {
    mockRunOrNull.mockReturnValue("some output");
    expect(isDockerRunning()).toBe(true);
  });

  it("returns false when docker info fails", () => {
    mockRunOrNull.mockReturnValue(null);
    expect(isDockerRunning()).toBe(false);
  });
});

describe("isComposeV2", () => {
  it("returns true for v2 output", () => {
    mockRunOrNull.mockReturnValue("Docker Compose version v2.24.0");
    expect(isComposeV2()).toBe(true);
  });

  it("returns false when compose not available", () => {
    mockRunOrNull.mockReturnValue(null);
    expect(isComposeV2()).toBe(false);
  });

  it("returns false for v1 output", () => {
    mockRunOrNull.mockReturnValue("docker-compose version 1.29.0");
    expect(isComposeV2()).toBe(false);
  });
});

describe("composeFile", () => {
  it("returns dev compose file by default", () => {
    expect(composeFile()).toBe("/project/docker/docker-compose.yml");
  });

  it("returns full compose file when full=true", () => {
    expect(composeFile(true)).toBe("/project/docker/docker-compose.full.yml");
  });
});

describe("composeUp", () => {
  it("runs docker compose up with dev file", () => {
    composeUp();
    expect(mockRun).toHaveBeenCalledWith(
      "docker compose -f /project/docker/docker-compose.yml up -d --build",
      { cwd: "/project" },
    );
  });

  it("uses full compose file when full=true and sets FORCE_HTTPS=false", () => {
    composeUp({ full: true });
    expect(mockRun).toHaveBeenCalledWith(
      "docker compose -f /project/docker/docker-compose.full.yml up -d --build",
      {
        cwd: "/project",
        env: expect.objectContaining({ FORCE_HTTPS: "false" }),
      },
    );
  });
});

describe("composeDown", () => {
  it("runs docker compose down", () => {
    composeDown();
    expect(mockRun).toHaveBeenCalledWith(
      "docker compose -f /project/docker/docker-compose.yml down",
      { cwd: "/project" },
    );
  });

  it("adds -v flag when volumes=true", () => {
    composeDown({ volumes: true });
    expect(mockRun).toHaveBeenCalledWith(
      "docker compose -f /project/docker/docker-compose.yml down -v",
      { cwd: "/project" },
    );
  });
});

describe("composePs", () => {
  it("parses json output into container info", () => {
    mockRunOrNull.mockReturnValue(
      '{"Name":"neoboard-postgres","State":"running","Status":"Up 5 minutes"}\n' +
        '{"Name":"neoboard-neo4j","State":"running","Status":"Up 5 minutes"}',
    );
    const result = composePs();
    expect(result).toEqual([
      { name: "neoboard-postgres", state: "running", status: "Up 5 minutes" },
      { name: "neoboard-neo4j", state: "running", status: "Up 5 minutes" },
    ]);
  });

  it("returns empty array when command fails", () => {
    mockRunOrNull.mockReturnValue(null);
    expect(composePs()).toEqual([]);
  });

  it("returns empty array on invalid json", () => {
    mockRunOrNull.mockReturnValue("not json");
    expect(composePs()).toEqual([]);
  });
});

describe("dockerExec", () => {
  it("runs command in container via execInContainer", () => {
    mockDockerExec.mockReturnValue("output");
    const result = dockerExec("neoboard-postgres", "pg_isready");
    expect(result).toBe("output");
    expect(mockDockerExec).toHaveBeenCalledWith(
      "neoboard-postgres",
      "pg_isready",
    );
  });
});

describe("isPgReady", () => {
  it("returns true when pg_isready succeeds", () => {
    mockDockerExec.mockReturnValue("accepting connections");
    expect(isPgReady()).toBe(true);
  });

  it("returns false when pg_isready fails", () => {
    mockDockerExec.mockImplementation(() => {
      throw new Error("not ready");
    });
    expect(isPgReady()).toBe(false);
  });
});

describe("isNeo4jReady", () => {
  it("returns true when docker inspect reports healthy", () => {
    mockRunOrNull.mockReturnValue("healthy");
    expect(isNeo4jReady()).toBe(true);
  });

  it("returns false when docker inspect reports starting", () => {
    mockRunOrNull.mockReturnValue("starting");
    expect(isNeo4jReady()).toBe(false);
  });
});
