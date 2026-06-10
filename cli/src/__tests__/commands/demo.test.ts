import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../commands/setup.js", () => ({
  runSetup: vi.fn(),
}));

vi.mock("../../commands/db/seed.js", () => ({
  runDbSeed: vi.fn(),
}));

vi.mock("../../lib/output.js", () => ({
  success: vi.fn(),
  banner: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  createSpinner: vi.fn(() => ({
    start: vi.fn(),
    succeed: vi.fn(),
    fail: vi.fn(),
  })),
}));

vi.mock("../../lib/exec.js", () => ({
  run: vi.fn(),
}));

vi.mock("../../lib/prompt.js", () => ({
  confirm: vi.fn(),
}));

vi.mock("../../lib/config.js", () => ({
  paths: { root: "/repo" },
  getMode: vi.fn(() => "local"),
}));

vi.mock("../../lib/showcases.js", () => ({
  loadShowcases: vi.fn(async () => ({
    SHOWCASES: [
      {
        key: "chart-gallery",
        label: "Chart Gallery",
        description: "17 pages",
        jsonPath: "/repo/scripts/demo/chart-gallery.json",
      },
      {
        key: "click-actions",
        label: "Click Actions",
        description: "3 pages",
        jsonPath: "/repo/scripts/demo/click-actions.json",
      },
    ],
    SHOWCASE_KEYS: new Set(["chart-gallery", "click-actions"]),
    parseOnlyFlag: (raw: string | undefined): string[] | undefined => {
      if (!raw) return undefined;
      const keys = raw
        .split(",")
        .map((k: string) => k.trim())
        .filter(Boolean);
      const valid = new Set(["chart-gallery", "click-actions"]);
      const invalid = keys.filter((k: string) => !valid.has(k));
      if (invalid.length > 0) {
        throw new Error(`Unknown showcase key(s): ${invalid.join(", ")}`);
      }
      return keys;
    },
  })),
}));

import { runSetup } from "../../commands/setup.js";
import { runDbSeed } from "../../commands/db/seed.js";
import { banner, error as logError, info } from "../../lib/output.js";
import { run as execRun } from "../../lib/exec.js";
import { confirm } from "../../lib/prompt.js";
import { getMode } from "../../lib/config.js";
import {
  runDemo,
  runDemoSeed,
  runDemoList,
  runDemoReset,
} from "../../commands/demo.js";

const mockRunSetup = vi.mocked(runSetup);
const mockRunDbSeed = vi.mocked(runDbSeed);
const mockExecRun = vi.mocked(execRun);
const mockConfirm = vi.mocked(confirm);
const mockLogError = vi.mocked(logError);
const mockInfo = vi.mocked(info);
const mockGetMode = vi.mocked(getMode);

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = 0;
  mockRunSetup.mockResolvedValue(true);
});

describe("runDemo", () => {
  it("calls setup then seed", async () => {
    await runDemo();
    expect(mockRunSetup).toHaveBeenCalledBefore(mockRunDbSeed);
  });

  it("passes mode and full=true to setup", async () => {
    await runDemo({ mode: "local" });
    expect(mockRunSetup).toHaveBeenCalledWith({ mode: "local", full: true });
  });

  it("seeds both neo4j and demo data", async () => {
    await runDemo();
    expect(mockRunDbSeed).toHaveBeenCalledWith({
      neo4j: true,
      demo: true,
      dockerNetwork: true,
    });
  });

  it("shows login credentials", async () => {
    await runDemo();
    expect(banner).toHaveBeenCalledWith(
      expect.arrayContaining([expect.stringContaining("admin@neoboard.local")]),
    );
  });

  it("aborts without seeding or credentials banner when setup fails", async () => {
    mockRunSetup.mockResolvedValue(false);
    await runDemo();
    expect(mockRunDbSeed).not.toHaveBeenCalled();
    expect(banner).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

describe("runDemoSeed", () => {
  it("invokes seed-demo.mjs with no --only when no filter given", async () => {
    await runDemoSeed();
    expect(mockExecRun).toHaveBeenCalledWith(
      expect.stringMatching(/node .*seed-demo\.mjs$/),
      expect.any(Object),
    );
  });

  it("passes --only flag through to the seed script", async () => {
    await runDemoSeed({ only: "chart-gallery" });
    expect(mockExecRun).toHaveBeenCalledWith(
      expect.stringContaining("--only=chart-gallery"),
      expect.any(Object),
    );
  });

  it("supports multiple keys in --only", async () => {
    await runDemoSeed({ only: "chart-gallery,click-actions" });
    expect(mockExecRun).toHaveBeenCalledWith(
      expect.stringContaining("--only=chart-gallery,click-actions"),
      expect.any(Object),
    );
  });

  it("rejects unknown showcase keys with a helpful message", async () => {
    await runDemoSeed({ only: "bogus" });
    expect(mockLogError).toHaveBeenCalledWith(
      expect.stringContaining("Unknown showcase key"),
    );
    expect(process.exitCode).toBe(1);
    expect(mockExecRun).not.toHaveBeenCalled();
  });
});

describe("runDemoList", () => {
  it("prints every showcase key", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runDemoList();
    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("chart-gallery");
    expect(output).toContain("click-actions");
    logSpy.mockRestore();
  });

  it("prints usage hints", async () => {
    await runDemoList();
    const infoCalls = mockInfo.mock.calls.map((c) => String(c[0])).join("\n");
    expect(infoCalls).toContain("neoboard demo seed");
  });
});

describe("runDemoReset", () => {
  it("prompts for confirmation when --force is not set", async () => {
    mockConfirm.mockResolvedValueOnce(false);
    await runDemoReset();
    expect(mockConfirm).toHaveBeenCalled();
    expect(mockExecRun).not.toHaveBeenCalled();
  });

  it("aborts when the user declines", async () => {
    mockConfirm.mockResolvedValueOnce(false);
    await runDemoReset();
    expect(mockExecRun).not.toHaveBeenCalled();
  });

  it("runs seed script with --reset when --force is set", async () => {
    await runDemoReset({ force: true });
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockExecRun).toHaveBeenCalledWith(
      expect.stringContaining("--reset"),
      expect.any(Object),
    );
  });

  it("runs seed script with --reset after user confirms", async () => {
    mockConfirm.mockResolvedValueOnce(true);
    await runDemoReset();
    expect(mockExecRun).toHaveBeenCalledWith(
      expect.stringContaining("--reset"),
      expect.any(Object),
    );
  });

  it("propagates errors from the seed script", async () => {
    mockExecRun.mockImplementationOnce(() => {
      throw new Error("script crashed");
    });
    await expect(runDemoReset({ force: true })).rejects.toThrow(
      "script crashed",
    );
  });
});

describe("dockerEnv (via runDemoSeed)", () => {
  it("passes docker host env vars when mode is docker", async () => {
    mockGetMode.mockReturnValue("docker");
    await runDemoSeed();
    const callEnv = mockExecRun.mock.calls[0]?.[1]?.env;
    expect(callEnv).toMatchObject({
      NEO4J_HOST: "neoboard-neo4j",
      PG_HOST: "neoboard-postgres",
    });
  });

  it("uses process.env when mode is local", async () => {
    mockGetMode.mockReturnValue("local");
    await runDemoSeed();
    const callEnv = mockExecRun.mock.calls[0]?.[1]?.env;
    expect(callEnv).toBe(process.env);
  });
});

describe("runDemoSeed error paths", () => {
  it("propagates errors from the seed script", async () => {
    mockExecRun.mockImplementationOnce(() => {
      throw new Error("seed crashed");
    });
    await expect(runDemoSeed()).rejects.toThrow("seed crashed");
  });
});
