import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
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

import { existsSync, writeFileSync } from "node:fs";
import { ensureDockerEnvFile, DOCKER_ENV_PATH } from "../../lib/docker-env.js";

const mockExistsSync = vi.mocked(existsSync);
const mockWriteFileSync = vi.mocked(writeFileSync);

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
