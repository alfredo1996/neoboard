import { describe, it, expect, vi, beforeEach } from "vitest";

const mockConfig = {
  ports: { app: 3000, postgres: 5432, neo4j_http: 7474, neo4j_bolt: 7687 },
  postgres: { user: "neoboard", password: "neoboard", database: "neoboard" },
  neo4j: { user: "neo4j", password: "password" },
  seed: { script: "scripts/seed.mjs", neo4j_cypher: "init.cypher" },
};

vi.mock("../../lib/config.js", () => ({
  paths: { projectConfig: "/project/neoboard.config.json" },
  readProjectConfig: vi.fn(() => ({ ...mockConfig })),
  writeProjectConfig: vi.fn(),
}));

vi.mock("../../lib/output.js", () => ({
  info: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

import { readProjectConfig, writeProjectConfig } from "../../lib/config.js";
import { info, success, error as logError } from "../../lib/output.js";
import {
  runConfigList,
  runConfigGet,
  runConfigSet,
} from "../../commands/config.js";

const mockReadProjectConfig = vi.mocked(readProjectConfig);
const mockWriteProjectConfig = vi.mocked(writeProjectConfig);

beforeEach(() => {
  vi.clearAllMocks();
  mockReadProjectConfig.mockReturnValue({ ...mockConfig });
  process.exitCode = 0;
});

describe("runConfigList", () => {
  it("prints all valid keys with their values", () => {
    runConfigList();
    const calls = vi.mocked(info).mock.calls.map((c) => String(c[0]));
    expect(calls.some((l) => l.includes("ports.app = 3000"))).toBe(true);
    expect(calls.some((l) => l.includes("postgres.user = neoboard"))).toBe(
      true,
    );
    expect(calls.some((l) => l.includes("neo4j.password = password"))).toBe(
      true,
    );
  });

  it("prints config file path", () => {
    runConfigList();
    const calls = vi.mocked(info).mock.calls.map((c) => String(c[0]));
    expect(calls.some((l) => l.includes("neoboard.config.json"))).toBe(true);
  });
});

describe("runConfigGet", () => {
  it("prints the value for a valid key", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    runConfigGet("ports.app");
    expect(logSpy).toHaveBeenCalledWith("3000");
    logSpy.mockRestore();
  });

  it("prints string values for non-numeric keys", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    runConfigGet("postgres.user");
    expect(logSpy).toHaveBeenCalledWith("neoboard");
    logSpy.mockRestore();
  });

  it("logs error and sets exitCode=1 for unknown key", () => {
    runConfigGet("invalid.key");
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining("Unknown key"),
    );
    expect(process.exitCode).toBe(1);
  });
});

describe("runConfigSet", () => {
  it("writes updated config for a valid key", () => {
    runConfigSet("ports.app", "4000");
    expect(mockWriteProjectConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        ports: expect.objectContaining({ app: 4000 }),
      }),
    );
    expect(success).toHaveBeenCalledWith(expect.stringContaining("ports.app"));
  });

  it("parses port values as integers", () => {
    runConfigSet("ports.postgres", "5433");
    expect(mockWriteProjectConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        ports: expect.objectContaining({ postgres: 5433 }),
      }),
    );
  });

  it("sets string values for non-numeric keys", () => {
    runConfigSet("postgres.user", "admin");
    expect(mockWriteProjectConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        postgres: expect.objectContaining({ user: "admin" }),
      }),
    );
  });

  it("logs error and sets exitCode=1 for unknown key", () => {
    runConfigSet("invalid.key", "value");
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining("Unknown key"),
    );
    expect(process.exitCode).toBe(1);
    expect(mockWriteProjectConfig).not.toHaveBeenCalled();
  });

  it("throws for non-numeric port value (NaN guard)", () => {
    expect(() => runConfigSet("ports.app", "notanumber")).toThrow(
      /not a number/,
    );
    expect(mockWriteProjectConfig).not.toHaveBeenCalled();
  });
});
