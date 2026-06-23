import { describe, it, expect, vi, beforeEach } from "vitest";
import { run, runOrNull, spawn, ExecError } from "../../lib/exec.js";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
  spawn: vi.fn(),
}));

import { execSync, spawn as nodeSpawn } from "node:child_process";

const mockExecSync = vi.mocked(execSync);
const mockSpawn = vi.mocked(nodeSpawn);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("run", () => {
  it("returns trimmed stdout on success", () => {
    mockExecSync.mockReturnValue("  hello world  \n");
    expect(run("echo hello")).toBe("hello world");
  });

  it("passes cwd and env options", () => {
    mockExecSync.mockReturnValue("ok");
    const env = { ...process.env, FOO: "bar" };
    run("test-cmd", { cwd: "/tmp", env });
    expect(mockExecSync).toHaveBeenCalledWith(
      "test-cmd",
      expect.objectContaining({
        cwd: "/tmp",
        env,
      }),
    );
  });

  it("throws ExecError on failure", () => {
    const err = Object.assign(new Error("fail"), {
      status: 42,
      stderr: "bad stuff",
    });
    mockExecSync.mockImplementation(() => {
      throw err;
    });
    try {
      run("bad-cmd");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ExecError);
      const execErr = e as ExecError;
      expect(execErr.cmd).toBe("bad-cmd");
      expect(execErr.exitCode).toBe(42);
      expect(execErr.stderr).toBe("bad stuff");
    }
  });

  it("defaults exitCode to 1 when status is undefined", () => {
    const err = Object.assign(new Error("fail"), { stderr: "" });
    mockExecSync.mockImplementation(() => {
      throw err;
    });
    try {
      run("fail-cmd");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect((e as ExecError).exitCode).toBe(1);
    }
  });
});

describe("runOrNull", () => {
  it("returns stdout on success", () => {
    mockExecSync.mockReturnValue("result");
    expect(runOrNull("echo ok")).toBe("result");
  });

  it("returns null on failure", () => {
    mockExecSync.mockImplementation(() => {
      throw new Error("fail");
    });
    expect(runOrNull("bad-cmd")).toBeNull();
  });
});

describe("spawn", () => {
  it("calls child_process.spawn with inherited stdio by default", () => {
    const fakeChild = {} as ReturnType<typeof nodeSpawn>;
    mockSpawn.mockReturnValue(fakeChild);
    const result = spawn("npm", ["run", "dev"]);
    expect(result).toBe(fakeChild);
    expect(mockSpawn).toHaveBeenCalledWith("npm", ["run", "dev"], {
      stdio: "inherit",
    });
  });

  it("allows overriding spawn options", () => {
    const fakeChild = {} as ReturnType<typeof nodeSpawn>;
    mockSpawn.mockReturnValue(fakeChild);
    spawn("npm", ["test"], { cwd: "/app" });
    expect(mockSpawn).toHaveBeenCalledWith("npm", ["test"], {
      stdio: "inherit",
      cwd: "/app",
    });
  });
});

// ─── Secret redaction in ExecError (#967) ───────────────────────────────────

describe("ExecError secret redaction", () => {
  it("redacts -p passwords in cmd, stderr, and message", () => {
    const e = new ExecError(
      'docker exec n cypher-shell -u neo4j -p s3cret! "RETURN 1"',
      1,
      "auth failed for -p s3cret!",
    );
    expect(e.cmd).not.toContain("s3cret!");
    expect(e.stderr).not.toContain("s3cret!");
    expect(e.message).not.toContain("s3cret!");
    expect(e.cmd).toContain("-p ***");
  });

  it("redacts key=value secrets and connection-string passwords", () => {
    const e = new ExecError(
      "psql postgresql://user:hunter2@host:5432/db",
      1,
      "PASSWORD=topsecret rejected; token=abc123",
    );
    expect(e.cmd).toContain("://user:***@");
    expect(e.cmd).not.toContain("hunter2");
    expect(e.stderr).not.toContain("topsecret");
    expect(e.stderr).not.toContain("abc123");
  });

  it("leaves innocent commands untouched", () => {
    const e = new ExecError("docker compose ps", 1, "no such service");
    expect(e.cmd).toBe("docker compose ps");
    expect(e.stderr).toBe("no such service");
  });
});

describe("dockerExec env forwarding (#967)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards env vars via -e flags without values in argv", async () => {
    const { dockerExec } = await import("../../lib/exec.js");
    mockExecSync.mockReturnValue("ok");
    dockerExec("neoboard-neo4j", 'cypher-shell "RETURN 1"', {
      env: { NEO4J_USERNAME: "neo4j", NEO4J_PASSWORD: "s3cret!" },
    });
    const [cmd, opts] = mockExecSync.mock.calls[0] as [
      string,
      { env?: NodeJS.ProcessEnv },
    ];
    expect(cmd).toContain("-e NEO4J_USERNAME -e NEO4J_PASSWORD");
    expect(cmd).not.toContain("s3cret!");
    expect(opts.env?.NEO4J_PASSWORD).toBe("s3cret!");
  });

  it("runs without env opts exactly as before", async () => {
    const { dockerExec } = await import("../../lib/exec.js");
    mockExecSync.mockReturnValue("ok");
    dockerExec("c1", "echo hi");
    const [cmd] = mockExecSync.mock.calls[0] as [string];
    expect(cmd).toBe("docker exec c1 echo hi");
  });
});
