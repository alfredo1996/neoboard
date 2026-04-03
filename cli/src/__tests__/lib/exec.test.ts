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
