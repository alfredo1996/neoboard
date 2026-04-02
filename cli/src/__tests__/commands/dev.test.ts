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
}));

vi.mock("../../lib/output.js", () => ({
  info: vi.fn(),
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
});

describe("runDev", () => {
  it("prints info message in docker mode without spawning", async () => {
    mockGetMode.mockReturnValue("docker");
    await runDev();
    expect(info).toHaveBeenCalledWith(expect.stringContaining("Docker mode"));
    expect(mockSpawn).not.toHaveBeenCalled();
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
