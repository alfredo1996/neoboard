import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock("node:crypto", () => ({
  randomBytes: vi.fn(() => ({
    toString: () => "a".repeat(64),
  })),
}));

vi.mock("../../lib/config.js", () => ({
  assertCheckout: vi.fn(),
  paths: { root: "/project" },
  getMode: vi.fn(() => "docker"),
  isStandalone: vi.fn(() => false),
}));

// Only the built-in version is faked: requestedVersion's validation is under test.
vi.mock("../../lib/version.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/version.js")>()),
  BUILT_IN_VERSION: "1.9.2",
}));

vi.mock("../../lib/output.js", () => ({
  info: vi.fn(),
  success: vi.fn(),
}));

import { existsSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import {
  ensureDockerEnvFile,
  DOCKER_ENV_PATH,
  buildSeedEnv,
} from "../../lib/docker-env.js";
import { getMode, isStandalone } from "../../lib/config.js";

const mockExistsSync = vi.mocked(existsSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockGetMode = vi.mocked(getMode);
const mockStandalone = vi.mocked(isStandalone);

const SEED_CONFIG = {
  postgres: { user: "neoboard", password: "neoboard", database: "neoboard" },
  ports: { postgres: 5432 },
};

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

  it("generates ADMIN_BOOTSTRAP_TOKEN — without it the first admin can never be created (#1312)", () => {
    // signup.ts requires process.env.ADMIN_BOOTSTRAP_TOKEN to be truthy for the
    // first-user branch. When docker/.env omits it, the app container sees
    // undefined and NO value the user types can validate — a fresh Docker
    // install ends up with an instance nobody can log into.
    mockExistsSync.mockReturnValue(false);
    ensureDockerEnvFile();
    const content = mockWriteFileSync.mock.calls[0][1] as string;
    expect(content).toContain("ADMIN_BOOTSTRAP_TOKEN=");
  });

  it("writes the token in a form readDockerEnvSecrets can hand back to the banner", async () => {
    const { readDockerEnvSecrets } = await import("../../lib/docker-env.js");
    mockExistsSync.mockReturnValue(false);
    ensureDockerEnvFile();
    const written = mockWriteFileSync.mock.calls[0][1] as string;

    // Round-trip the generated file through the reader the banner uses.
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(written);
    expect(readDockerEnvSecrets().ADMIN_BOOTSTRAP_TOKEN).toBeTruthy();
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

  it("strips surrounding quotes (dotenv), which the old hand-rolled parser kept", async () => {
    const { readDockerEnvSecrets } = await import("../../lib/docker-env.js");
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('ENCRYPTION_KEY="quoted-value"\n');
    expect(readDockerEnvSecrets()).toEqual({ ENCRYPTION_KEY: "quoted-value" });
  });
});

describe("buildSeedEnv (#1039)", () => {
  // buildSeedEnv only reads docker/.env when the caller hasn't already set
  // these — clear them so ambient CI env can't make the assertions flaky.
  let ambient: { ENCRYPTION_KEY?: string; DATABASE_URL?: string };
  beforeEach(() => {
    ambient = {
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
      DATABASE_URL: process.env.DATABASE_URL,
    };
    delete process.env.ENCRYPTION_KEY;
    delete process.env.DATABASE_URL;
  });
  afterEach(() => {
    for (const k of ["ENCRYPTION_KEY", "DATABASE_URL"] as const) {
      if (ambient[k] === undefined) delete process.env[k];
      else process.env[k] = ambient[k];
    }
  });

  it("threads Docker hostnames, a localhost DSN, and the docker/.env ENCRYPTION_KEY in Docker mode", () => {
    mockGetMode.mockReturnValue("docker");
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("ENCRYPTION_KEY=docker-key-abc\n");

    const env = buildSeedEnv(SEED_CONFIG);

    expect(env.NEO4J_HOST).toBe("neoboard-neo4j");
    expect(env.PG_HOST).toBe("neoboard-postgres");
    expect(env.DATABASE_URL).toBe(
      "postgresql://neoboard:neoboard@localhost:5432/neoboard",
    );
    // Same key the app container uses, so seeded connectors decrypt at runtime.
    expect(env.ENCRYPTION_KEY).toBe("docker-key-abc");
  });

  it("URL-encodes DSN components so special characters in credentials survive", () => {
    mockGetMode.mockReturnValue("docker");
    mockExistsSync.mockReturnValue(false);

    const env = buildSeedEnv({
      postgres: {
        user: "neo board",
        password: "pa:ss@word",
        database: "neoboard",
      },
      ports: { postgres: 5432 },
    });

    expect(env.DATABASE_URL).toBe(
      "postgresql://neo%20board:pa%3Ass%40word@localhost:5432/neoboard",
    );
  });

  it("returns process.env unchanged in local mode", () => {
    mockGetMode.mockReturnValue("local");
    const env = buildSeedEnv(SEED_CONFIG);
    expect(env).toBe(process.env);
  });

  it("does not override a pre-set ENCRYPTION_KEY or DATABASE_URL", () => {
    mockGetMode.mockReturnValue("docker");
    const prev = {
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
      DATABASE_URL: process.env.DATABASE_URL,
    };
    process.env.ENCRYPTION_KEY = "caller-key";
    process.env.DATABASE_URL = "postgres://caller/db";
    try {
      const env = buildSeedEnv(SEED_CONFIG);
      expect(env.ENCRYPTION_KEY).toBe("caller-key");
      expect(env.DATABASE_URL).toBe("postgres://caller/db");
    } finally {
      // restore
      if (prev.ENCRYPTION_KEY === undefined) delete process.env.ENCRYPTION_KEY;
      else process.env.ENCRYPTION_KEY = prev.ENCRYPTION_KEY;
      if (prev.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = prev.DATABASE_URL;
    }
  });
});

describe("ensureDockerEnvFile: image pin for the standalone install (#1314)", () => {
  const written = () => mockWriteFileSync.mock.calls[0][1] as string;
  const SECRETS = "ENCRYPTION_KEY=keep-me\nADMIN_BOOTSTRAP_TOKEN=tok\n";

  beforeEach(() => {
    mockStandalone.mockReturnValue(true);
    delete process.env.NEOBOARD_VERSION;
  });
  afterEach(() => {
    delete process.env.NEOBOARD_VERSION;
    mockStandalone.mockReturnValue(false);
  });

  it("creates docker/ first: a standalone directory has none until now", () => {
    mockExistsSync.mockReturnValue(false);
    ensureDockerEnvFile();
    expect(vi.mocked(mkdirSync)).toHaveBeenCalledWith("/project/docker", {
      recursive: true,
    });
    expect(vi.mocked(mkdirSync).mock.invocationCallOrder[0]).toBeLessThan(
      mockWriteFileSync.mock.invocationCallOrder[0],
    );
  });

  it("pins the image to the version the binary was built from on first run", () => {
    mockExistsSync.mockReturnValue(false);
    ensureDockerEnvFile();
    expect(written()).toContain(
      "NEOBOARD_IMAGE=ghcr.io/alfredo1996/neoboard:1.9.2\n",
    );
  });

  it("lets NEOBOARD_VERSION override the built-in version on first run", () => {
    mockExistsSync.mockReturnValue(false);
    process.env.NEOBOARD_VERSION = "1.9.5";
    ensureDockerEnvFile();
    expect(written()).toContain("neoboard:1.9.5\n");
  });

  it("does not pin a checkout, which builds its own image", () => {
    mockStandalone.mockReturnValue(false);
    mockExistsSync.mockReturnValue(false);
    ensureDockerEnvFile();
    expect(written()).not.toContain("NEOBOARD_IMAGE");
  });

  it("leaves an existing file untouched when no version was asked for", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      SECRETS + "NEOBOARD_IMAGE=ghcr.io/alfredo1996/neoboard:1.9.0\n",
    );
    ensureDockerEnvFile();
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it("upgrades only the image line when NEOBOARD_VERSION differs, keeping every secret", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      SECRETS + "NEOBOARD_IMAGE=ghcr.io/alfredo1996/neoboard:1.9.0\n",
    );
    process.env.NEOBOARD_VERSION = "1.9.5";
    ensureDockerEnvFile();
    expect(written()).toBe(
      SECRETS + "NEOBOARD_IMAGE=ghcr.io/alfredo1996/neoboard:1.9.5\n",
    );
  });

  it("appends the image line when an existing file has none and a version is asked for", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(SECRETS);
    process.env.NEOBOARD_VERSION = "1.9.5";
    ensureDockerEnvFile();
    expect(written()).toBe(
      SECRETS + "NEOBOARD_IMAGE=ghcr.io/alfredo1996/neoboard:1.9.5\n",
    );
  });

  it.each(["1.9.2\nENCRYPTION_KEY=x", "latest", "../x", "1.9"])(
    "refuses NEOBOARD_VERSION=%j, which would write a line it should not",
    (v) => {
      mockExistsSync.mockReturnValue(false);
      process.env.NEOBOARD_VERSION = v;
      expect(() => ensureDockerEnvFile()).toThrow(/NEOBOARD_VERSION/);
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    },
  );
});

describe("ensureDockerEnvFile: file hygiene (#1314 review)", () => {
  it("creates docker/.env readable by its owner only: it holds the key and the first-run token", () => {
    mockExistsSync.mockReturnValue(false);
    ensureDockerEnvFile();
    expect(mockWriteFileSync.mock.calls[0][2]).toEqual({ mode: 0o600 });
  });

  it("moves every NEOBOARD_IMAGE line when the file has two, since the last one wins", () => {
    mockStandalone.mockReturnValue(true);
    mockExistsSync.mockReturnValue(true);
    const old = "NEOBOARD_IMAGE=ghcr.io/alfredo1996/neoboard:1.9.0\n";
    mockReadFileSync.mockReturnValue(`A=1\n${old}B=2\n${old}`);
    process.env.NEOBOARD_VERSION = "1.9.5";
    try {
      ensureDockerEnvFile();
    } finally {
      delete process.env.NEOBOARD_VERSION;
      mockStandalone.mockReturnValue(false);
    }
    const now = "NEOBOARD_IMAGE=ghcr.io/alfredo1996/neoboard:1.9.5\n";
    expect(mockWriteFileSync.mock.calls[0][1]).toBe(`A=1\n${now}B=2\n${now}`);
  });
});
