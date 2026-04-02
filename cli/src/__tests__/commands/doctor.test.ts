import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/exec.js", () => ({
  runOrNull: vi.fn(),
}));

vi.mock("../../lib/ports.js", () => ({
  isPortAvailable: vi.fn(),
}));

vi.mock("../../lib/config.js", () => ({
  paths: { appDir: "/project/app", envFile: "/project/app/.env.local" },
  readProjectConfig: vi.fn(() => ({
    ports: { app: 3000, postgres: 5432, neo4j_http: 7474, neo4j_bolt: 7687 },
    postgres: { user: "neoboard", password: "neoboard", database: "neoboard" },
    neo4j: { user: "neo4j", password: "neoboard123" },
    seed: {
      script: "scripts/seed-demo.mjs",
      neo4j_cypher: "docker/neo4j/init.cypher",
    },
  })),
}));

vi.mock("../../lib/output.js", () => ({
  success: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

import { runOrNull } from "../../lib/exec.js";
import { isPortAvailable } from "../../lib/ports.js";
import { existsSync } from "node:fs";
import {
  checkDockerRunning,
  checkDockerComposeV2,
  checkNodeVersion,
  checkPortAvailable,
  checkNodeModulesExist,
  checkEnvFileExists,
  runDoctor,
  printResults,
} from "../../commands/doctor.js";
import { success, warn, error as logError } from "../../lib/output.js";

const mockRunOrNull = vi.mocked(runOrNull);
const mockIsPortAvailable = vi.mocked(isPortAvailable);
const mockExistsSync = vi.mocked(existsSync);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checkDockerRunning", () => {
  it("returns ok when docker info succeeds", () => {
    mockRunOrNull.mockReturnValue("ok");
    const result = checkDockerRunning();
    expect(result.status).toBe("ok");
  });

  it("returns fail when docker info fails", () => {
    mockRunOrNull.mockReturnValue(null);
    const result = checkDockerRunning();
    expect(result.status).toBe("fail");
  });
});

describe("checkDockerComposeV2", () => {
  it("returns ok for v2", () => {
    mockRunOrNull.mockReturnValue("Docker Compose version v2.24.0");
    expect(checkDockerComposeV2().status).toBe("ok");
  });

  it("returns fail when not available", () => {
    mockRunOrNull.mockReturnValue(null);
    expect(checkDockerComposeV2().status).toBe("fail");
  });
});

describe("checkNodeVersion", () => {
  it("returns ok for current node (>= 20)", () => {
    const result = checkNodeVersion();
    const major = parseInt(process.version.slice(1), 10);
    expect(result.status).toBe(major >= 20 ? "ok" : "fail");
  });
});

describe("checkPortAvailable", () => {
  it("returns ok when port is free", async () => {
    mockIsPortAvailable.mockResolvedValue(true);
    const result = await checkPortAvailable(3000, "App");
    expect(result.status).toBe("ok");
    expect(result.name).toBe("Port 3000 (App)");
  });

  it("returns warn when port is in use", async () => {
    mockIsPortAvailable.mockResolvedValue(false);
    const result = await checkPortAvailable(5432, "PostgreSQL");
    expect(result.status).toBe("warn");
  });
});

describe("checkNodeModulesExist", () => {
  it("returns ok when node_modules exists", () => {
    mockExistsSync.mockReturnValue(true);
    expect(checkNodeModulesExist().status).toBe("ok");
  });

  it("returns warn when missing", () => {
    mockExistsSync.mockReturnValue(false);
    expect(checkNodeModulesExist().status).toBe("warn");
  });
});

describe("checkEnvFileExists", () => {
  it("returns ok when .env.local exists", () => {
    mockExistsSync.mockReturnValue(true);
    expect(checkEnvFileExists().status).toBe("ok");
  });

  it("returns warn when missing", () => {
    mockExistsSync.mockReturnValue(false);
    expect(checkEnvFileExists().status).toBe("warn");
  });
});

describe("runDoctor", () => {
  it("returns all check results", async () => {
    mockRunOrNull.mockReturnValue("Docker Compose version v2.24.0");
    mockIsPortAvailable.mockResolvedValue(true);
    mockExistsSync.mockReturnValue(true);

    const results = await runDoctor();
    // 3 sync checks + 4 port checks + 2 file checks = 9
    expect(results.length).toBe(9);
    expect(results.every((r) => r.status === "ok")).toBe(true);
  });
});

describe("printResults", () => {
  it("calls success for ok results", () => {
    printResults([{ name: "test", status: "ok", message: "all good" }]);
    expect(success).toHaveBeenCalledWith("all good");
  });

  it("calls warn for warn results", () => {
    printResults([{ name: "test", status: "warn", message: "careful" }]);
    expect(warn).toHaveBeenCalledWith("careful");
  });

  it("calls error for fail results and returns true", () => {
    const hasFailure = printResults([
      { name: "test", status: "fail", message: "broken" },
    ]);
    expect(logError).toHaveBeenCalledWith("broken");
    expect(hasFailure).toBe(true);
  });

  it("returns false when no failures", () => {
    const hasFailure = printResults([
      { name: "a", status: "ok", message: "ok" },
      { name: "b", status: "warn", message: "warn" },
    ]);
    expect(hasFailure).toBe(false);
  });
});
