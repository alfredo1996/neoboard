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
import {
  validateEnv,
  generateEnvFile,
  runEnv,
  listEnvVars,
  getEnvVar,
  setEnvVar,
} from "../../commands/env.js";

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
      "DATABASE_URL=postgres://...\nENCRYPTION_KEY=abc\nNEXTAUTH_SECRET=def\nNEXTAUTH_URL=http://localhost:3000\n",
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
  });

  it("ignores comments and blank lines", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      "# comment\n\nDATABASE_URL=x\nENCRYPTION_KEY=x\nNEXTAUTH_SECRET=x\nNEXTAUTH_URL=x\n",
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

describe("getEnvVar", () => {
  it("returns null when file does not exist", () => {
    mockExistsSync.mockReturnValue(false);
    expect(getEnvVar("DATABASE_URL")).toBeNull();
  });

  it("returns value when key exists", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("DATABASE_URL=postgres://localhost\n");
    expect(getEnvVar("DATABASE_URL")).toBe("postgres://localhost");
  });

  it("returns null when key is not set", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("DATABASE_URL=postgres://localhost\n");
    expect(getEnvVar("OIDC_ISSUER")).toBeNull();
  });
});

describe("setEnvVar", () => {
  it("creates file and writes key when file does not exist", () => {
    mockExistsSync.mockReturnValue(false);
    setEnvVar("OIDC_ISSUER", "https://idp.example.com");
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    const content = mockWriteFileSync.mock.calls[0][1] as string;
    expect(content).toContain("OIDC_ISSUER=https://idp.example.com");
  });

  it("updates existing key in place", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      "DATABASE_URL=old-value\nENCRYPTION_KEY=abc\n",
    );
    setEnvVar("DATABASE_URL", "new-value");
    const content = mockWriteFileSync.mock.calls[0][1] as string;
    expect(content).toContain("DATABASE_URL=new-value");
    expect(content).not.toContain("old-value");
    expect(content).toContain("ENCRYPTION_KEY=abc");
  });

  it("removes all duplicate keys when updating", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      "DATABASE_URL=first\nENCRYPTION_KEY=abc\nDATABASE_URL=second\n",
    );
    setEnvVar("DATABASE_URL", "new-value");
    const content = mockWriteFileSync.mock.calls[0][1] as string;
    expect(content).toContain("DATABASE_URL=new-value");
    // Both old occurrences should be gone
    expect(content).not.toContain("first");
    expect(content).not.toContain("second");
    // Only one DATABASE_URL line
    const dbLines = content
      .split("\n")
      .filter((l: string) => l.startsWith("DATABASE_URL="));
    expect(dbLines).toHaveLength(1);
  });

  it("appends new key when not present", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("DATABASE_URL=postgres://localhost\n");
    setEnvVar("OIDC_ISSUER", "https://idp.example.com");
    const content = mockWriteFileSync.mock.calls[0][1] as string;
    expect(content).toContain("DATABASE_URL=postgres://localhost");
    expect(content).toContain("OIDC_ISSUER=https://idp.example.com");
  });
});

describe("listEnvVars", () => {
  it("shows set/unset status for known vars", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("DATABASE_URL=postgres://localhost\n");
    listEnvVars();
    expect(info).toHaveBeenCalled();
  });

  it("handles missing .env.local gracefully", () => {
    mockExistsSync.mockReturnValue(false);
    listEnvVars();
    expect(info).toHaveBeenCalled();
  });
});
