import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock("node:crypto", () => ({
  randomBytes: vi.fn(() => ({
    toString: () => "a".repeat(64),
  })),
}));

vi.mock("../../lib/config.js", () => ({
  paths: { root: "/project" },
}));

vi.mock("../../lib/output.js", () => ({
  info: vi.fn(),
  success: vi.fn(),
}));

import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { ensureDockerEnvFile, DOCKER_ENV_PATH } from "../../lib/docker-env.js";

const mockExistsSync = vi.mocked(existsSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockReadFileSync = vi.mocked(readFileSync);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ensureDockerEnvFile", () => {
  it("generates docker/.env with per-install secrets when missing (#970)", () => {
    mockExistsSync.mockReturnValue(false);
    const path = ensureDockerEnvFile();
    expect(path).toBe("/project/docker/.env");
    expect(DOCKER_ENV_PATH.endsWith("docker/.env")).toBe(true);
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    const content = mockWriteFileSync.mock.calls[0][1] as string;
    expect(content).toContain("ENCRYPTION_KEY=");
    expect(content).toContain("NEXTAUTH_SECRET=");
    expect(content).toContain("API_KEY_HMAC_SECRET=");
  });

  it("never overwrites an existing file — the ENCRYPTION_KEY must be stable across restarts", () => {
    mockExistsSync.mockReturnValue(true);
    const path = ensureDockerEnvFile();
    expect(path).toBe("/project/docker/.env");
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });
});

describe("readDockerEnvSecrets (#969)", () => {
  it("returns {} when docker/.env does not exist", async () => {
    const { readDockerEnvSecrets } = await import("../../lib/docker-env.js");
    mockExistsSync.mockReturnValue(false);
    expect(readDockerEnvSecrets()).toEqual({});
  });

  it("parses key=value lines, skipping comments and blanks", async () => {
    const { readDockerEnvSecrets } = await import("../../lib/docker-env.js");
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      "# comment\n\nENCRYPTION_KEY=abc123\nNEXTAUTH_SECRET=def456\n",
    );
    expect(readDockerEnvSecrets()).toEqual({
      ENCRYPTION_KEY: "abc123",
      NEXTAUTH_SECRET: "def456",
    });
  });
});
