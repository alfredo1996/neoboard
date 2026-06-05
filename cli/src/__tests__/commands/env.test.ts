import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock("node:crypto", () => ({
  randomBytes: vi.fn(() => ({
    toString: () => "a".repeat(64),
  })),
}));

vi.mock("../../lib/config.js", () => ({
  paths: {
    envFile: "/project/app/.env.local",
    envExample: "/project/.env.example",
  },
  readProjectConfig: vi.fn(() => ({
    ports: { app: 3000, postgres: 5432 },
    postgres: { user: "neoboard", password: "neoboard", database: "neoboard" },
  })),
  getMode: vi.fn(() => "local"),
}));

vi.mock("../../lib/output.js", () => ({
  info: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  banner: vi.fn(),
}));

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { getMode } from "../../lib/config.js";
import { info, error as logError } from "../../lib/output.js";
import { validateEnv, generateEnvFile, runEnv } from "../../commands/env.js";

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockGetMode = vi.mocked(getMode);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetMode.mockReturnValue("local");
});

describe("validateEnv", () => {
  it("reports missing when file does not exist", () => {
    mockExistsSync.mockReturnValue(false);
    const result = validateEnv();
    expect(result.ok).toBe(false);
    expect(result.missing).toContain("(file does not exist)");
  });

  it("passes when all required vars present", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      "DATABASE_URL=postgres://...\n" +
        "ENCRYPTION_KEY=abc\n" +
        "NEXTAUTH_SECRET=def\n" +
        "NEXTAUTH_URL=http://localhost:3000\n" +
        "API_KEY_HMAC_SECRET=ghi\n",
    );
    const result = validateEnv();
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("reports specific missing vars", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("DATABASE_URL=postgres://...\n");
    const result = validateEnv();
    expect(result.ok).toBe(false);
    expect(result.missing).toContain("ENCRYPTION_KEY");
    expect(result.missing).toContain("NEXTAUTH_SECRET");
    // API_KEY_HMAC_SECRET became required in #907 — every install needs it
    // for the community API-keys feature.
    expect(result.missing).toContain("API_KEY_HMAC_SECRET");
  });

  it("ignores comments and blank lines", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      "# comment\n\nDATABASE_URL=x\nENCRYPTION_KEY=x\nNEXTAUTH_SECRET=x\nNEXTAUTH_URL=x\nAPI_KEY_HMAC_SECRET=x\n",
    );
    expect(validateEnv().ok).toBe(true);
  });
});

describe("generateEnvFile", () => {
  it("generates file when none exists", () => {
    mockExistsSync.mockReturnValue(false);
    generateEnvFile();
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    const content = mockWriteFileSync.mock.calls[0][1] as string;
    expect(content).toContain("DATABASE_URL=");
    expect(content).toContain("ENCRYPTION_KEY=");
    expect(content).toContain("NEXTAUTH_SECRET=");
    expect(content).toContain("ADMIN_BOOTSTRAP_TOKEN=");
    // #907: HMAC secret is auto-generated alongside the other secrets so a
    // fresh install can use the community API-keys feature out of the box.
    expect(content).toContain("API_KEY_HMAC_SECRET=");
  });

  it("skips when file exists and no regenerate flag", () => {
    mockExistsSync.mockReturnValue(true);
    generateEnvFile();
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it("overwrites when regenerate is true", () => {
    mockExistsSync.mockReturnValue(true);
    generateEnvFile({ regenerate: true });
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
  });

  it("builds DATABASE_URL from config", () => {
    mockExistsSync.mockReturnValue(false);
    generateEnvFile();
    const content = mockWriteFileSync.mock.calls[0][1] as string;
    expect(content).toContain(
      "DATABASE_URL=postgresql://neoboard:neoboard@localhost:5432/neoboard",
    );
  });
});

describe("runEnv", () => {
  it("exits early in docker mode", async () => {
    mockGetMode.mockReturnValue("docker");
    await runEnv({});
    expect(info).toHaveBeenCalledWith(expect.stringContaining("Docker mode"));
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it("validates when --validate flag is set", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("DATABASE_URL=x\n");
    await runEnv({ validate: true });
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining("Missing variables"),
    );
  });

  it("generates env file by default", async () => {
    mockExistsSync.mockReturnValue(false);
    await runEnv({});
    expect(mockWriteFileSync).toHaveBeenCalled();
  });
});
