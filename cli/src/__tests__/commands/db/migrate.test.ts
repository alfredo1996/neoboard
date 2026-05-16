import { describe, it, expect, vi, beforeEach } from "vitest";

const { FakeExecError } = vi.hoisted(() => {
  class FakeExecError extends Error {
    constructor(
      public readonly cmd: string,
      public readonly exitCode: number,
      public readonly stderr: string,
    ) {
      super(`Command failed (exit ${exitCode}): ${cmd}\n${stderr}`);
      this.name = "ExecError";
    }
  }
  return { FakeExecError };
});

vi.mock("../../../lib/exec.js", () => ({
  run: vi.fn(),
  ExecError: FakeExecError,
}));

vi.mock("../../../lib/config.js", () => ({
  paths: {
    journalPath: "/project/app/drizzle/migrations/meta/_journal.json",
    appDir: "/project/app",
    envFile: "/project/app/.env.local",
  },
  readProjectConfig: vi.fn(() => ({
    ports: { postgres: 5432 },
    postgres: { user: "neoboard", password: "neoboard", database: "neoboard" },
  })),
}));

const { spinnerInstance } = vi.hoisted(() => ({
  spinnerInstance: {
    start: vi.fn(),
    succeed: vi.fn(),
    fail: vi.fn(),
  },
}));

vi.mock("../../../lib/output.js", () => ({
  info: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  createSpinner: vi.fn(() => spinnerInstance),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

import { run } from "../../../lib/exec.js";
import { info, warn, error as logError } from "../../../lib/output.js";
import { existsSync, readFileSync } from "node:fs";
import {
  showMigrationStatus,
  showDryRun,
  runDbMigrate,
  redactSensitiveDetails,
} from "../../../commands/db/migrate.js";

const mockRun = vi.mocked(run);
const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);

const SAMPLE_JOURNAL = JSON.stringify({
  version: "7",
  entries: [
    { idx: 0, tag: "0000_wooden_zeigeist", when: 1700000000000 },
    { idx: 1, tag: "0001_rapid_iron_monger", when: 1700100000000 },
  ],
});

beforeEach(() => {
  vi.clearAllMocks();
  spinnerInstance.start.mockClear();
  spinnerInstance.succeed.mockClear();
  spinnerInstance.fail.mockClear();
  process.exitCode = 0;
  // Default: .env.local exists with a DATABASE_URL
  mockExistsSync.mockReturnValue(true);
  mockReadFileSync.mockReturnValue(
    "DATABASE_URL=postgresql://neoboard:neoboard@localhost:5432/neoboard\n",
  );
});

describe("showMigrationStatus", () => {
  it("displays migration entries", () => {
    mockReadFileSync.mockReturnValue(SAMPLE_JOURNAL);
    showMigrationStatus();
    expect(info).toHaveBeenCalledWith("Migrations: 2 available");
  });

  it("warns when no journal found", () => {
    mockExistsSync.mockReturnValue(false);
    showMigrationStatus();
    expect(warn).toHaveBeenCalledWith("No migration journal found.");
  });
});

describe("showDryRun", () => {
  it("shows pending migrations without applying", () => {
    mockReadFileSync.mockReturnValue(SAMPLE_JOURNAL);
    showDryRun();
    expect(info).toHaveBeenCalledWith("Would apply 2 migration(s):");
    expect(mockRun).not.toHaveBeenCalled();
  });
});

describe("runDbMigrate", () => {
  it("shows status when --status flag set", async () => {
    mockReadFileSync.mockReturnValue(SAMPLE_JOURNAL);
    await runDbMigrate({ status: true });
    expect(info).toHaveBeenCalledWith("Migrations: 2 available");
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("shows dry run when --dry-run flag set", async () => {
    mockReadFileSync.mockReturnValue(SAMPLE_JOURNAL);
    await runDbMigrate({ dryRun: true });
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("runs migrations locally with DATABASE_URL from .env.local", async () => {
    await runDbMigrate({});
    expect(mockRun).toHaveBeenCalledWith("npx drizzle-kit migrate", {
      cwd: "/project/app",
      env: expect.objectContaining({
        DATABASE_URL: "postgresql://neoboard:neoboard@localhost:5432/neoboard",
      }),
    });
  });

  it("falls back to config-derived DATABASE_URL when .env.local missing", async () => {
    mockExistsSync.mockReturnValue(false);
    await runDbMigrate({});
    expect(mockRun).toHaveBeenCalledWith("npx drizzle-kit migrate", {
      cwd: "/project/app",
      env: expect.objectContaining({
        DATABASE_URL: "postgresql://neoboard:neoboard@localhost:5432/neoboard",
      }),
    });
  });

  it("prints backup warning", async () => {
    await runDbMigrate({});
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining("neoboard db dump"),
    );
  });

  it("strips double quotes from DATABASE_URL in .env.local", async () => {
    mockReadFileSync.mockReturnValue(
      'DATABASE_URL="postgresql://neoboard:neoboard@localhost:5432/neoboard"\n',
    );
    await runDbMigrate({});
    expect(mockRun).toHaveBeenCalledWith("npx drizzle-kit migrate", {
      cwd: "/project/app",
      env: expect.objectContaining({
        DATABASE_URL: "postgresql://neoboard:neoboard@localhost:5432/neoboard",
      }),
    });
  });

  it("strips single quotes from DATABASE_URL in .env.local", async () => {
    mockReadFileSync.mockReturnValue(
      "DATABASE_URL='postgresql://neoboard:neoboard@localhost:5432/neoboard'\n",
    );
    await runDbMigrate({});
    expect(mockRun).toHaveBeenCalledWith("npx drizzle-kit migrate", {
      cwd: "/project/app",
      env: expect.objectContaining({
        DATABASE_URL: "postgresql://neoboard:neoboard@localhost:5432/neoboard",
      }),
    });
  });

  it("URI-encodes special characters in config fallback credentials", async () => {
    mockExistsSync.mockReturnValue(false);
    const { readProjectConfig } = await import("../../../lib/config.js");
    vi.mocked(readProjectConfig).mockReturnValue({
      ports: { postgres: 5432 },
      postgres: {
        user: "neo@board",
        password: "p@ss:word",
        database: "neo board",
      },
    } as ReturnType<typeof readProjectConfig>);
    await runDbMigrate({});
    expect(mockRun).toHaveBeenCalledWith("npx drizzle-kit migrate", {
      cwd: "/project/app",
      env: expect.objectContaining({
        DATABASE_URL:
          "postgresql://neo%40board:p%40ss%3Aword@localhost:5432/neo%20board",
      }),
    });
  });

  it("warns about --to flag limitation", async () => {
    await runDbMigrate({ to: "1.0.0" });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("--to 1.0.0"));
  });

  describe("error classification", () => {
    function failWith(stderr: string): void {
      mockRun.mockImplementationOnce(() => {
        throw new FakeExecError("npx drizzle-kit migrate", 1, stderr);
      });
    }

    it("classifies ECONNREFUSED as a connection error with actionable hint", async () => {
      const stderr = "Error: connect ECONNREFUSED 127.0.0.1:5432";
      failWith(stderr);

      await runDbMigrate({});

      expect(spinnerInstance.fail).toHaveBeenCalledWith(
        expect.stringContaining("Migration failed"),
      );
      const hintMsgs = vi
        .mocked(logError)
        .mock.calls.map((c) => c[0] as string)
        .join("\n");
      expect(hintMsgs.toLowerCase()).toContain("connection");
      expect(hintMsgs).toContain("DATABASE_URL");
      expect(hintMsgs).toMatch(/docker compose|docker-compose/i);
      expect(hintMsgs).toContain(stderr);
      expect(process.exitCode).toBe(1);
    });

    it("classifies password-authentication failures as connection errors", async () => {
      const stderr =
        'error: password authentication failed for user "neoboard"';
      failWith(stderr);

      await runDbMigrate({});

      const hintMsgs = vi
        .mocked(logError)
        .mock.calls.map((c) => c[0] as string)
        .join("\n");
      expect(hintMsgs.toLowerCase()).toContain("connection");
      expect(hintMsgs).toContain(stderr);
      expect(process.exitCode).toBe(1);
    });

    it("classifies advisory-lock contention with a wait-or-investigate hint", async () => {
      const stderr =
        "error: could not obtain advisory lock for migration; another process holds it";
      failWith(stderr);

      await runDbMigrate({});

      const hintMsgs = vi
        .mocked(logError)
        .mock.calls.map((c) => c[0] as string)
        .join("\n");
      expect(hintMsgs.toLowerCase()).toContain("lock");
      expect(hintMsgs.toLowerCase()).toMatch(/another|process|wait/);
      expect(hintMsgs).toContain(stderr);
      expect(process.exitCode).toBe(1);
    });

    it("classifies schema conflicts (already exists / does not exist / constraint) with rollback guidance", async () => {
      const stderr = 'error: relation "users" already exists';
      failWith(stderr);

      await runDbMigrate({});

      const hintMsgs = vi
        .mocked(logError)
        .mock.calls.map((c) => c[0] as string)
        .join("\n");
      expect(hintMsgs.toLowerCase()).toContain("schema");
      // Mention the forward-only migration policy / db reset path
      expect(hintMsgs.toLowerCase()).toMatch(/migration|reset|drift/);
      expect(hintMsgs).toContain(stderr);
      expect(process.exitCode).toBe(1);
    });

    it("redacts credentials in surfaced stderr (DSN passwords + password= params)", async () => {
      failWith(
        "Error: connect ECONNREFUSED postgresql://neoboard:s3cret-pw@db.internal:5432/neoboard?password=alsosecret",
      );

      await runDbMigrate({});

      const hintMsgs = vi
        .mocked(logError)
        .mock.calls.map((c) => c[0] as string)
        .join("\n");
      expect(hintMsgs).not.toContain("s3cret-pw");
      expect(hintMsgs).not.toContain("alsosecret");
      expect(hintMsgs).toContain("***");
      // Non-secret context still preserved
      expect(hintMsgs).toContain("ECONNREFUSED");
      expect(hintMsgs).toContain("db.internal");
      expect(hintMsgs).toContain("neoboard");
    });

    it("falls back to a generic message for unrecognized failures, still emitting stderr", async () => {
      failWith("Something completely unexpected happened");

      await runDbMigrate({});

      const hintMsgs = vi
        .mocked(logError)
        .mock.calls.map((c) => c[0] as string)
        .join("\n");
      // Generic guidance + the raw stderr surfaced for debugging
      expect(hintMsgs).toContain("Something completely unexpected happened");
      expect(process.exitCode).toBe(1);
    });

    it("does not mark the spinner as succeeded when migration fails", async () => {
      failWith("error: connect ECONNREFUSED");

      await runDbMigrate({});

      expect(spinnerInstance.succeed).not.toHaveBeenCalled();
      expect(spinnerInstance.fail).toHaveBeenCalled();
    });
  });
});

describe("redactSensitiveDetails", () => {
  it("masks the password in a postgres DSN", () => {
    expect(
      redactSensitiveDetails(
        "connect to postgresql://neoboard:s3cret@db.host:5432/neoboard failed",
      ),
    ).toBe("connect to postgresql://neoboard:***@db.host:5432/neoboard failed");
  });

  it("masks password= and access_token= query parameters", () => {
    expect(
      redactSensitiveDetails("...password=hunter2 access_token=abc.def"),
    ).toBe("...password=*** access_token=***");
  });

  it("leaves text with no secrets unchanged", () => {
    const safe = "ECONNREFUSED on 127.0.0.1:5432";
    expect(redactSensitiveDetails(safe)).toBe(safe);
  });
});
