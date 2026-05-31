import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/exec.js", () => ({
  spawn: vi.fn(() => ({
    kill: vi.fn(),
    on: vi.fn(),
  })),
}));

vi.mock("../../lib/config.js", () => ({
  paths: { appDir: "/project/app" },
  getMode: vi.fn(() => "local"),
  readProjectConfig: vi.fn(() => ({
    ports: { app: 3000, postgres: 5432, neo4j_http: 7474, neo4j_bolt: 7687 },
  })),
}));

vi.mock("../../lib/output.js", () => ({
  info: vi.fn(),
  warn: vi.fn(),
  banner: vi.fn(),
}));

vi.mock("../../lib/docker.js", () => ({
  isPgReady: vi.fn(() => true),
  isNeo4jReady: vi.fn(() => true),
  composeUp: vi.fn(),
}));

vi.mock("../../lib/health.js", () => ({
  waitForHealth: vi.fn(),
}));

vi.mock("../../commands/env.js", () => ({
  validateEnv: vi.fn(() => ({ ok: true, missing: [] })),
}));

import { spawn } from "../../lib/exec.js";
import { getMode } from "../../lib/config.js";
import { info } from "../../lib/output.js";
import { runDev } from "../../commands/dev.js";

const mockSpawn = vi.mocked(spawn);
const mockGetMode = vi.mocked(getMode);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetMode.mockReturnValue("local");
  process.exitCode = 0;
});

describe("runDev", () => {
  it("prints info message in docker mode without spawning", async () => {
    mockGetMode.mockReturnValue("docker");
    await runDev();
    expect(info).toHaveBeenCalledWith(expect.stringContaining("Docker mode"));
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("sets exitCode=1 in docker mode", async () => {
    mockGetMode.mockReturnValue("docker");
    await runDev();
    expect(process.exitCode).toBe(1);
  });

  it("spawns npm run dev in local mode", async () => {
    const mockChild = {
      kill: vi.fn(),
      on: vi.fn((_event: string, cb: () => void) => {
        // Immediately close to resolve the promise
        if (_event === "close") cb();
      }),
    };
    mockSpawn.mockReturnValue(mockChild as ReturnType<typeof spawn>);

    await runDev();
    expect(mockSpawn).toHaveBeenCalledWith("npm", ["run", "dev"], {
      cwd: "/project/app",
    });
  });
});
