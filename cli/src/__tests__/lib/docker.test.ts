import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../lib/docker-env.js", () => ({
  ensureDockerEnvFile: vi.fn(() => "/project/docker/.env"),
}));

// Fake TCP socket for the local-mode fallback (#1091): "connect" fires when
// the port should read as open, "error" when it should read as closed.
const { netConnectMock } = vi.hoisted(() => ({ netConnectMock: vi.fn() }));
vi.mock("node:net", () => ({ createConnection: netConnectMock }));

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
import { getMode, readProjectConfig } from "../../lib/config.js";
import {
  isDockerRunning,
  composeFile,
  composeUp,
  composeDown,
  composePs,
  isPgReady,
  isNeo4jReady,
  isAppReady,
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
      'docker compose -f "/project/docker/docker-compose.yml" up -d --build',
      expect.objectContaining({ cwd: "/project" }),
    );
  });

  it("uses full compose file with the generated env-file when full=true (#970)", () => {
    composeUp({ full: true });
    expect(mockRun).toHaveBeenCalledWith(
      'docker compose -f "/project/docker/docker-compose.full.yml" --env-file "/project/docker/.env" up -d --build',
      expect.objectContaining({ cwd: "/project" }),
    );
  });

  // Reaching a database on the HOST is opt-in per run (#1346): most installs
  // do not need it — a database in the same compose network is reached by its
  // service name — and it punches a route from the container to the host's
  // network, so it should not be on by default for everyone.
  describe("--expose-host overlay (#1346)", () => {
    const cmd = (n = 0) => vi.mocked(run).mock.calls[n][0] as string;

    it("is absent unless asked for", () => {
      composeUp({ full: true });
      expect(cmd()).not.toContain("expose-host");
    });

    it.each([[false], [true]])(
      "adds the overlay when requested (full=%s)",
      (full) => {
        composeUp({ full, exposeHost: true });
        expect(cmd()).toContain("docker-compose.expose-host.yml");
      },
    );

    it("layers the overlay AFTER the base file", () => {
      // Compose merges left to right; an overlay listed first would be
      // overridden by the base and silently do nothing.
      composeUp({ full: true, exposeHost: true });
      const c = cmd();
      expect(c.indexOf("docker-compose.full.yml")).toBeLessThan(
        c.indexOf("docker-compose.expose-host.yml"),
      );
    });

    it("keeps the generated env-file for the full stack", () => {
      // The overlay must not displace the per-install secrets (#970).
      composeUp({ full: true, exposeHost: true });
      expect(cmd()).toContain('--env-file "/project/docker/.env"');
    });
  });

  // The configured ports were consumed by every readiness probe, the generated
  // DATABASE_URL and the banner URLs — but NOT by the thing that binds them.
  // `neoboard config set ports.app 4000` published on 3000, polled 4000, and
  // reported "NeoBoard app failed to start" for a stack that was up (#1313).
  describe("configured host ports (#1313)", () => {
    const DEFAULT_CONFIG = {
      ports: { app: 3000, postgres: 5432, neo4j_http: 7474, neo4j_bolt: 7687 },
      postgres: { user: "neoboard", password: "neoboard", database: "neoboard" },
      neo4j: { user: "neo4j", password: "neoboard123" },
      seed: { script: "s.mjs", neo4j_cypher: "i.cypher" },
    };
    // mockReturnValue, not Once: clearAllMocks does not drain a queued Once,
    // so a value the code under test never consumes leaks into the next test.
    // That is what happened on the red run here.
    const withPorts = (ports: Record<string, number>) =>
      vi.mocked(readProjectConfig).mockReturnValue({
        ...DEFAULT_CONFIG,
        ports,
      } as ReturnType<typeof readProjectConfig>);
    afterEach(() =>
      vi
        .mocked(readProjectConfig)
        .mockReturnValue(DEFAULT_CONFIG as ReturnType<typeof readProjectConfig>),
    );

    const envOfFirstRun = () => vi.mocked(run).mock.calls[0][1]?.env;

    it.each([[false], [true]])(
      "passes them into the compose environment (full=%s)",
      (full) => {
        withPorts({ app: 4000, postgres: 55432, neo4j_http: 7475, neo4j_bolt: 7688 });
        composeUp({ full });
        expect(envOfFirstRun()).toMatchObject({
          NEOBOARD_PORT_APP: "4000",
          NEOBOARD_PORT_POSTGRES: "55432",
          NEOBOARD_PORT_NEO4J_HTTP: "7475",
          NEOBOARD_PORT_NEO4J_BOLT: "7688",
        });
      },
    );

    it("points NEXTAUTH_URL at the configured app port", () => {
      // Hardcoded to localhost:3000 in docker-compose.full.yml — on a remapped
      // install the auth callback URL no longer matches where the app is.
      withPorts({ app: 4000, postgres: 5432, neo4j_http: 7474, neo4j_bolt: 7687 });
      composeUp({ full: true });
      expect(envOfFirstRun()).toMatchObject({
        NEXTAUTH_URL: "http://localhost:4000",
      });
    });

    it("keeps the ambient environment so OS overrides still win", () => {
      composeUp();
      expect(envOfFirstRun()).toMatchObject({ PATH: process.env.PATH });
    });
  });
});

describe("composeDown", () => {
  it("runs docker compose down", () => {
    composeDown();
    expect(mockRun).toHaveBeenCalledWith(
      'docker compose -f "/project/docker/docker-compose.yml" down --remove-orphans',
      { cwd: "/project" },
    );
  });

  it("adds -v flag when volumes=true", () => {
    composeDown({ volumes: true });
    expect(mockRun).toHaveBeenCalledWith(
      'docker compose -f "/project/docker/docker-compose.yml" down --remove-orphans -v',
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

  it("quotes the -f compose-file path so spaced checkout paths work (#MEDIUM)", () => {
    mockRunOrNull.mockReturnValue(null);
    composePs();
    expect(mockRunOrNull).toHaveBeenCalledWith(
      expect.stringContaining('-f "/project/docker/docker-compose.yml"'),
      expect.any(Object),
    );
  });
});

describe("isPgReady", () => {
  it("returns true when pg_isready succeeds", async () => {
    mockDockerExec.mockReturnValue("accepting connections");
    expect(await isPgReady()).toBe(true);
  });

  it("returns false when pg_isready fails", async () => {
    mockDockerExec.mockImplementation(() => {
      throw new Error("not ready");
    });
    expect(await isPgReady()).toBe(false);
  });

  it("rejects a postgres.user with shell metacharacters before probing (#MEDIUM)", async () => {
    vi.mocked(readProjectConfig).mockReturnValueOnce({
      ports: { app: 3000, postgres: 5432, neo4j_http: 7474, neo4j_bolt: 7687 },
      postgres: { user: "x; rm -rf ~", password: "p", database: "neoboard" },
      neo4j: { user: "neo4j", password: "p" },
      seed: { script: "s.mjs", neo4j_cypher: "" },
    });
    await expect(isPgReady()).rejects.toThrow(/Invalid PostgreSQL identifier/);
    expect(mockDockerExec).not.toHaveBeenCalled();
  });
});

describe("isPgReady — local mode (#1091)", () => {
  const fakeSocket = (event: "connect" | "error") => {
    const handlers: Record<string, () => void> = {};
    const sock = {
      on: (ev: string, cb: () => void) => {
        handlers[ev] = cb;
        if (ev === event) setTimeout(() => handlers[ev](), 0);
        return sock;
      },
      destroy: vi.fn(),
    };
    return sock;
  };

  beforeEach(() => {
    vi.mocked(getMode).mockReturnValue("local");
  });

  afterEach(() => {
    vi.mocked(getMode).mockReturnValue("docker");
  });

  it("uses pg_isready when the binary exists", async () => {
    mockRunOrNull.mockImplementation((cmd: string) =>
      cmd.startsWith("command -v") ? "/usr/bin/pg_isready" : "accepting",
    );
    expect(await isPgReady()).toBe(true);
    expect(netConnectMock).not.toHaveBeenCalled();
  });

  it("falls back to a TCP probe when pg_isready is missing and the port is open", async () => {
    mockRunOrNull.mockReturnValue(null); // command -v fails → binary missing
    netConnectMock.mockImplementation(() => fakeSocket("connect"));
    expect(await isPgReady()).toBe(true);
  });

  it("reports not-ready when the binary is missing and the port is closed", async () => {
    mockRunOrNull.mockReturnValue(null);
    netConnectMock.mockImplementation(() => fakeSocket("error"));
    expect(await isPgReady()).toBe(false);
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

describe("isAppReady", () => {
  it("returns true when /api/health returns 200", () => {
    mockRunOrNull.mockReturnValue("200");
    expect(isAppReady()).toBe(true);
    expect(mockRunOrNull).toHaveBeenCalledWith(
      expect.stringContaining("http://localhost:3000/api/health"),
    );
  });

  it("returns false when /api/health returns 503", () => {
    mockRunOrNull.mockReturnValue("503");
    expect(isAppReady()).toBe(false);
  });

  it("returns false when curl fails (network error)", () => {
    mockRunOrNull.mockReturnValue(null);
    expect(isAppReady()).toBe(false);
  });

  it("uses the configured app port", () => {
    mockRunOrNull.mockReturnValue("200");
    isAppReady();
    expect(mockRunOrNull).toHaveBeenCalledWith(
      expect.stringContaining(":3000/api/health"),
    );
  });
});
