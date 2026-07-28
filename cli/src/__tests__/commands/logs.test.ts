import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";

vi.mock("../../lib/exec.js", () => ({
  spawn: vi.fn(),
}));

vi.mock("../../lib/docker.js", () => ({
  composeFile: vi.fn(() => "/project/docker/docker-compose.yml"),
}));

vi.mock("../../lib/config.js", () => ({
  assertCheckout: vi.fn(),
  paths: { root: "/project" },
}));

vi.mock("../../lib/output.js", () => ({
  error: vi.fn(),
}));

import { spawn } from "../../lib/exec.js";
import { error as logError } from "../../lib/output.js";
import { runLogs } from "../../commands/logs.js";

const mockSpawn = vi.mocked(spawn);
const mockLogError = vi.mocked(logError);

function makeChild() {
  const emitter = new EventEmitter() as EventEmitter & {
    kill: ReturnType<typeof vi.fn>;
  };
  emitter.kill = vi.fn();
  // Immediately schedule a close so the awaited promise resolves
  queueMicrotask(() => emitter.emit("close"));
  return emitter;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = 0;
  mockSpawn.mockImplementation(() => makeChild() as ReturnType<typeof spawn>);
});

describe("runLogs", () => {
  it("runs `docker compose logs` with the resolved compose file by default", async () => {
    await runLogs({});

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const [bin, args, opts] = mockSpawn.mock.calls[0];
    expect(bin).toBe("docker");
    expect(args).toEqual([
      "compose",
      "-f",
      "/project/docker/docker-compose.yml",
      "logs",
    ]);
    expect(opts).toEqual({ cwd: "/project" });
  });

  it("passes --tail N when `lines` option is provided", async () => {
    await runLogs({ lines: "50" });

    const [, args] = mockSpawn.mock.calls[0];
    expect(args).toContain("--tail");
    const tailIdx = (args as string[]).indexOf("--tail");
    expect((args as string[])[tailIdx + 1]).toBe("50");
  });

  it("appends -f when `follow` option is set", async () => {
    await runLogs({ follow: true });

    const [, args] = mockSpawn.mock.calls[0];
    expect(args).toContain("-f");
  });

  it("maps known service aliases (pg → postgres) and appends the service name", async () => {
    await runLogs({ service: "pg" });

    const [, args] = mockSpawn.mock.calls[0];
    expect((args as string[])[(args as string[]).length - 1]).toBe("postgres");
  });

  it("passes a known service name through unchanged", async () => {
    await runLogs({ service: "neo4j" });

    const [, args] = mockSpawn.mock.calls[0];
    expect((args as string[])[(args as string[]).length - 1]).toBe("neo4j");
  });

  it("errors with available services and sets exit code 1 when the service is unknown", async () => {
    await runLogs({ service: "redis" });

    expect(mockSpawn).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalledTimes(1);
    const msg = mockLogError.mock.calls[0][0] as string;
    expect(msg).toContain('Unknown service "redis"');
    expect(msg).toContain("postgres");
    expect(msg).toContain("neo4j");
    expect(msg).toContain("app");
    expect(process.exitCode).toBe(1);
  });

  it("combines --tail, -f and a service in a single invocation", async () => {
    await runLogs({ lines: "100", follow: true, service: "app" });

    const [, args] = mockSpawn.mock.calls[0];
    const a = args as string[];
    expect(a).toContain("--tail");
    expect(a).toContain("100");
    expect(a).toContain("-f");
    expect(a[a.length - 1]).toBe("app");
  });

  it("resolves after the spawned child emits `close`", async () => {
    // If the promise didn't resolve on close, this test would hang.
    await expect(runLogs({})).resolves.toBeUndefined();
  });
});
