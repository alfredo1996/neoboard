import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/exec.js", () => ({
  runOrNull: vi.fn(),
}));

vi.mock("../../lib/ports.js", () => ({
  isPortAvailable: vi.fn(),
}));

vi.mock("../../lib/config.js", () => ({
  assertCheckout: vi.fn(),
  paths: {
    root: "/project",
    appDir: "/project/app",
    envFile: "/project/app/.env.local",
  },
  readProjectConfig: vi.fn(() => ({
    ports: { app: 3000, postgres: 5432, neo4j_http: 7474, neo4j_bolt: 7687 },
    postgres: { user: "neoboard", password: "neoboard", database: "neoboard" },
    neo4j: { user: "neo4j", password: "neoboard123" },
    seed: {
      script: "scripts/seed-demo.mjs",
      neo4j_cypher: "docker/neo4j/init.cypher",
    },
  })),
  getMode: vi.fn(() => "docker"),
}));

vi.mock("../../lib/output.js", () => ({
  success: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(() => "ENCRYPTION_KEY=" + "a".repeat(64)),
}));

vi.mock("../../lib/credential-probe.js", () => ({
  probeCredentialDecryption: vi.fn(),
}));

vi.mock("../../lib/docker-env.js", () => ({
  DOCKER_ENV_PATH: "docker/.env",
}));

vi.mock("dotenv", () => ({
  parse: vi.fn(() => ({ ENCRYPTION_KEY: "a".repeat(64) })),
}));

import { runOrNull } from "../../lib/exec.js";
import { isPortAvailable } from "../../lib/ports.js";
import { existsSync, readFileSync } from "node:fs";
import { getMode } from "../../lib/config.js";
import {
  checkDockerRunning,
  checkDockerComposeV2,
  checkNodeVersion,
  checkPortAvailable,
  checkNodeModulesExist,
  checkEnvFileExists,
  runDoctor,
  printResults,
} from "../../commands/doctor.js";
import { success, warn, error as logError } from "../../lib/output.js";
import { probeCredentialDecryption } from "../../lib/credential-probe.js";

const mockRunOrNull = vi.mocked(runOrNull);
const mockIsPortAvailable = vi.mocked(isPortAvailable);
const mockExistsSync = vi.mocked(existsSync);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checkDockerRunning", () => {
  it("returns ok when docker info succeeds", () => {
    mockRunOrNull.mockReturnValue("ok");
    const result = checkDockerRunning();
    expect(result.status).toBe("ok");
  });

  it("returns fail when docker info fails", () => {
    mockRunOrNull.mockReturnValue(null);
    const result = checkDockerRunning();
    expect(result.status).toBe("fail");
  });
});

describe("checkDockerComposeV2", () => {
  it("returns ok for v2", () => {
    mockRunOrNull.mockReturnValue("Docker Compose version v2.24.0");
    expect(checkDockerComposeV2().status).toBe("ok");
  });

  it("returns fail when not available", () => {
    mockRunOrNull.mockReturnValue(null);
    expect(checkDockerComposeV2().status).toBe("fail");
  });
});

describe("checkNodeVersion", () => {
  it("returns ok for current node (>= 20)", () => {
    const result = checkNodeVersion();
    const major = parseInt(process.version.slice(1), 10);
    expect(result.status).toBe(major >= 20 ? "ok" : "fail");
  });
});

describe("checkPortAvailable", () => {
  it("returns ok when port is free", async () => {
    mockIsPortAvailable.mockResolvedValue(true);
    const result = await checkPortAvailable(3000, "App");
    expect(result.status).toBe("ok");
    expect(result.name).toBe("Port 3000 (App)");
  });

  it("returns warn when port is in use", async () => {
    mockIsPortAvailable.mockResolvedValue(false);
    const result = await checkPortAvailable(5432, "PostgreSQL");
    expect(result.status).toBe("warn");
  });
});

describe("checkNodeModulesExist", () => {
  it("returns ok when node_modules exists", () => {
    mockExistsSync.mockReturnValue(true);
    expect(checkNodeModulesExist().status).toBe("ok");
  });

  it("returns warn when missing", () => {
    mockExistsSync.mockReturnValue(false);
    expect(checkNodeModulesExist().status).toBe("warn");
  });
});

describe("checkEnvFileExists", () => {
  it("returns ok when .env.local exists", () => {
    mockExistsSync.mockReturnValue(true);
    expect(checkEnvFileExists().status).toBe("ok");
  });

  it("returns warn when missing", () => {
    mockExistsSync.mockReturnValue(false);
    expect(checkEnvFileExists().status).toBe("warn");
  });
});

describe("runDoctor", () => {
  beforeEach(() => {
    vi.mocked(probeCredentialDecryption).mockResolvedValue({
      outcome: "ok",
    });
  });

  it("returns all check results", async () => {
    mockRunOrNull.mockReturnValue("Docker Compose version v2.24.0");
    mockIsPortAvailable.mockResolvedValue(true);
    mockExistsSync.mockReturnValue(true);

    const results = await runDoctor();
    // 3 sync checks + 4 port checks + 2 file checks + 1 credential probe = 10
    expect(results.length).toBe(10);
    expect(results.every((r) => r.status === "ok")).toBe(true);
  });

  // A well-formed key is not the RIGHT key. env-config validates the 64-hex
  // shape, /api/health reports it `set`, and doctor never looked at it — so an
  // instance with a mismatched key booted clean, passed every check, and then
  // failed on EVERY widget with Node's raw "Unsupported state or unable to
  // authenticate data", naming neither the key nor the fix (#1274).
  describe("credential decryption check (#1274)", () => {
    const credentialCheck = async () =>
      (await runDoctor()).find((r) => r.name === "Credential decryption");

    beforeEach(() => {
      mockRunOrNull.mockReturnValue("Docker Compose version v2.24.0");
      mockIsPortAvailable.mockResolvedValue(true);
      mockExistsSync.mockReturnValue(true);
    });

    it("reports ok when a stored credential decrypts", async () => {
      vi.mocked(probeCredentialDecryption).mockResolvedValue({ outcome: "ok" });
      expect((await credentialCheck())?.status).toBe("ok");
    });

    it("fails, naming ENCRYPTION_KEY, when it does not", async () => {
      vi.mocked(probeCredentialDecryption).mockResolvedValue({
        outcome: "mismatch",
      });
      const check = await credentialCheck();
      expect(check?.status).toBe("fail");
      expect(check?.message).toContain("ENCRYPTION_KEY");
    });

    it("skips rather than claiming ok when there is nothing to decrypt", async () => {
      // "ok" here would assert a verification that never happened — the exact
      // false-confidence this check exists to remove.
      vi.mocked(probeCredentialDecryption).mockResolvedValue({
        outcome: "no-credentials",
      });
      const check = await credentialCheck();
      expect(check?.status).toBe("skip");
      expect(check?.message).not.toContain("ENCRYPTION_KEY does not match");
    });

    it("skips when the database is unreachable, rather than failing", async () => {
      // An unreachable database is a different alarm, already covered by the
      // port checks. Reporting it as a key mismatch would send the operator
      // to rotate a key that is fine.
      vi.mocked(probeCredentialDecryption).mockResolvedValue({
        outcome: "unavailable",
      });
      expect((await credentialCheck())?.status).toBe("skip");
    });

    it("reads the key from docker/.env in Docker mode", async () => {
      vi.mocked(getMode).mockReturnValue("docker");
      await runDoctor();
      expect(vi.mocked(readFileSync).mock.calls.at(-1)?.[0]).toBe(
        "/project/docker/.env",
      );
      expect(vi.mocked(probeCredentialDecryption)).toHaveBeenCalledWith(
        "a".repeat(64),
      );
    });

    it("reads app/.env.local in local mode", async () => {
      // Different file per mode, or doctor checks a key the app never loads.
      vi.mocked(getMode).mockReturnValue("local");
      await runDoctor();
      expect(vi.mocked(readFileSync).mock.calls.at(-1)?.[0]).toBe(
        "/project/app/.env.local",
      );
    });

    it("probes with no key when the env file is absent", async () => {
      mockExistsSync.mockReturnValue(false);
      await runDoctor();
      expect(vi.mocked(probeCredentialDecryption)).toHaveBeenCalledWith(
        undefined,
      );
    });

    it("probes with no key when the env file cannot be parsed", async () => {
      // A truncated or half-written .env must not crash doctor — the command
      // an operator runs when things are already broken.
      vi.mocked(readFileSync).mockImplementationOnce(() => {
        throw new Error("EACCES");
      });
      const results = await runDoctor();
      expect(vi.mocked(probeCredentialDecryption)).toHaveBeenCalledWith(
        undefined,
      );
      expect(results).toHaveLength(10);
    });

    it("leaks no ciphertext or key material into any message", async () => {
      vi.mocked(probeCredentialDecryption).mockResolvedValue({
        outcome: "mismatch",
      });
      const check = await credentialCheck();
      // The probe returns an outcome, never the row it read — so there is
      // nothing for a message to accidentally interpolate.
      expect(JSON.stringify(check)).not.toMatch(/[A-Za-z0-9+/]{40,}={0,2}/);
    });
  });
});

describe("printResults", () => {
  it("calls success for ok results", () => {
    printResults([{ name: "test", status: "ok", message: "all good" }]);
    expect(success).toHaveBeenCalledWith("all good");
  });

  it("calls warn for warn results", () => {
    printResults([{ name: "test", status: "warn", message: "careful" }]);
    expect(warn).toHaveBeenCalledWith("careful");
  });

  it("calls error for fail results and returns true", () => {
    const hasFailure = printResults([
      { name: "test", status: "fail", message: "broken" },
    ]);
    expect(logError).toHaveBeenCalledWith("broken");
    expect(hasFailure).toBe(true);
  });

  it("returns false when no failures", () => {
    const hasFailure = printResults([
      { name: "a", status: "ok", message: "ok" },
      { name: "b", status: "warn", message: "warn" },
    ]);
    expect(hasFailure).toBe(false);
  });
});
