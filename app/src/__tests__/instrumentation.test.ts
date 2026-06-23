import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockBootstrapAdmin =
  vi.fn<(opts: { email: string; password: string }) => Promise<void>>();

vi.mock("@/lib/auth/bootstrap", () => ({
  bootstrapAdmin: mockBootstrapAdmin,
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("register (instrumentation hook)", () => {
  let register: () => Promise<void>;

  const savedRuntime = process.env.NEXT_RUNTIME;
  const savedEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const savedPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const savedSkip = process.env.SKIP_ENV_VALIDATION;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    // Most tests in this file don't care about env validation — opt them
    // all out so they exercise only the bootstrap path. The env-validation
    // block below clears this flag and tests the fail-fast behavior.
    process.env.SKIP_ENV_VALIDATION = "1";
    vi.doMock("@/lib/auth/bootstrap", () => ({
      bootstrapAdmin: mockBootstrapAdmin,
    }));
    const mod = await import("../instrumentation");
    register = mod.register;
  });

  afterEach(() => {
    // Restore env vars
    if (savedRuntime === undefined) delete process.env.NEXT_RUNTIME;
    else process.env.NEXT_RUNTIME = savedRuntime;

    if (savedEmail === undefined) delete process.env.BOOTSTRAP_ADMIN_EMAIL;
    else process.env.BOOTSTRAP_ADMIN_EMAIL = savedEmail;

    if (savedPassword === undefined)
      delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
    else process.env.BOOTSTRAP_ADMIN_PASSWORD = savedPassword;

    if (savedSkip === undefined) delete process.env.SKIP_ENV_VALIDATION;
    else process.env.SKIP_ENV_VALIDATION = savedSkip;
  });

  it("skips bootstrap when NEXT_RUNTIME is not nodejs", async () => {
    process.env.NEXT_RUNTIME = "edge";
    process.env.BOOTSTRAP_ADMIN_EMAIL = "admin@example.com";
    process.env.BOOTSTRAP_ADMIN_PASSWORD = "password123";
    await register();
    expect(mockBootstrapAdmin).not.toHaveBeenCalled();
  });

  it("skips bootstrap when BOOTSTRAP_ADMIN_EMAIL is not set", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    delete process.env.BOOTSTRAP_ADMIN_EMAIL;
    process.env.BOOTSTRAP_ADMIN_PASSWORD = "password123";
    await register();
    expect(mockBootstrapAdmin).not.toHaveBeenCalled();
  });

  it("skips bootstrap when BOOTSTRAP_ADMIN_PASSWORD is not set", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.BOOTSTRAP_ADMIN_EMAIL = "admin@example.com";
    delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
    await register();
    expect(mockBootstrapAdmin).not.toHaveBeenCalled();
  });

  it("calls bootstrapAdmin with env credentials on nodejs runtime", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.BOOTSTRAP_ADMIN_EMAIL = "admin@example.com";
    process.env.BOOTSTRAP_ADMIN_PASSWORD = "password123";
    mockBootstrapAdmin.mockResolvedValue(undefined);
    await register();
    expect(mockBootstrapAdmin).toHaveBeenCalledWith({
      email: "admin@example.com",
      password: "password123",
    });
  });

  it("swallows errors from bootstrapAdmin without crashing", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.BOOTSTRAP_ADMIN_EMAIL = "admin@example.com";
    process.env.BOOTSTRAP_ADMIN_PASSWORD = "password123";
    mockBootstrapAdmin.mockRejectedValue(new Error("DB connection failed"));
    await expect(register()).resolves.toBeUndefined();
  });

  it("swallows errors from query middleware bootstrap without crashing", async () => {
    vi.resetModules();
    vi.doMock("@/lib/auth/bootstrap", () => ({
      bootstrapAdmin: mockBootstrapAdmin,
    }));
    vi.doMock("@/lib/query/middleware/bootstrap", () => ({
      bootstrapQueryMiddleware: () => {
        throw new Error("middleware registration failed");
      },
    }));
    const mod = await import("../instrumentation");
    process.env.NEXT_RUNTIME = "nodejs";
    delete process.env.BOOTSTRAP_ADMIN_EMAIL;
    delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
    await expect(mod.register()).resolves.toBeUndefined();
  });
});

// ─── Migrate-on-boot (#985) ─────────────────────────────────────────────────

describe("register — migrate on boot", () => {
  const mockMigrateOnBoot = vi.fn(async () => {});

  const savedMigrate = process.env.MIGRATE_ON_START;

  async function loadRegister() {
    vi.resetModules();
    process.env.SKIP_ENV_VALIDATION = "1";
    vi.doMock("@/lib/auth/bootstrap", () => ({
      bootstrapAdmin: mockBootstrapAdmin,
    }));
    vi.doMock("@/lib/db/migrate-on-boot", async () => {
      const actual = await vi.importActual<
        typeof import("@/lib/db/migrate-on-boot")
      >("@/lib/db/migrate-on-boot");
      return { ...actual, migrateOnBoot: mockMigrateOnBoot };
    });
    const mod = await import("../instrumentation");
    return mod.register;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_RUNTIME = "nodejs";
  });

  afterEach(() => {
    if (savedMigrate === undefined) delete process.env.MIGRATE_ON_START;
    else process.env.MIGRATE_ON_START = savedMigrate;
  });

  it("does not migrate when MIGRATE_ON_START is unset", async () => {
    delete process.env.MIGRATE_ON_START;
    const register = await loadRegister();
    await register();
    expect(mockMigrateOnBoot).not.toHaveBeenCalled();
  });

  it("migrates before bootstrapping the admin when MIGRATE_ON_START=1", async () => {
    process.env.MIGRATE_ON_START = "1";
    process.env.BOOTSTRAP_ADMIN_EMAIL = "admin@example.com";
    process.env.BOOTSTRAP_ADMIN_PASSWORD = "password123";
    const register = await loadRegister();
    await register();
    expect(mockMigrateOnBoot).toHaveBeenCalledTimes(1);
    expect(mockBootstrapAdmin).toHaveBeenCalledTimes(1);
    expect(mockMigrateOnBoot.mock.invocationCallOrder[0]).toBeLessThan(
      mockBootstrapAdmin.mock.invocationCallOrder[0],
    );
  });

  it("exits the process when migration fails", async () => {
    process.env.MIGRATE_ON_START = "1";
    mockMigrateOnBoot.mockRejectedValueOnce(new Error("DDL exploded"));
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as never);
    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    const register = await loadRegister();
    await expect(register()).rejects.toThrow("process.exit called");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mockBootstrapAdmin).not.toHaveBeenCalled();

    exitSpy.mockRestore();
    stderrSpy.mockRestore();
  });
});

// ─── Cold-start env validation (fail-fast on missing required vars) ────────

describe("register — env validation", () => {
  const saved = {
    runtime: process.env.NEXT_RUNTIME,
    skip: process.env.SKIP_ENV_VALIDATION,
    encryption: process.env.ENCRYPTION_KEY,
    secret: process.env.NEXTAUTH_SECRET,
    dburl: process.env.DATABASE_URL,
    hmac: process.env.API_KEY_HMAC_SECRET,
  };

  const restore = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };

  afterEach(() => {
    restore("NEXT_RUNTIME", saved.runtime);
    restore("SKIP_ENV_VALIDATION", saved.skip);
    restore("ENCRYPTION_KEY", saved.encryption);
    restore("NEXTAUTH_SECRET", saved.secret);
    restore("DATABASE_URL", saved.dburl);
    restore("API_KEY_HMAC_SECRET", saved.hmac);
  });

  it("calls process.exit(1) when required vars are missing", async () => {
    vi.resetModules();
    process.env.NEXT_RUNTIME = "nodejs";
    delete process.env.SKIP_ENV_VALIDATION;
    delete process.env.ENCRYPTION_KEY;
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.DATABASE_URL;
    delete process.env.API_KEY_HMAC_SECRET;

    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      // Throw to short-circuit register() so the subsequent code (logger
      // import) isn't reached after the simulated exit.
      throw new Error("__exit__");
    }) as never);
    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    const mod = await import("../instrumentation");
    await expect(mod.register()).rejects.toThrow("__exit__");

    expect(exitSpy).toHaveBeenCalledWith(1);
    const stderrOutput = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(stderrOutput).toContain("ENCRYPTION_KEY");
    expect(stderrOutput).toContain("NEXTAUTH_SECRET");
    expect(stderrOutput).toContain("DATABASE_URL");

    exitSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it("does not exit when SKIP_ENV_VALIDATION=1 even with missing vars", async () => {
    vi.resetModules();
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.SKIP_ENV_VALIDATION = "1";
    delete process.env.ENCRYPTION_KEY;
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.DATABASE_URL;
    delete process.env.API_KEY_HMAC_SECRET;

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
    const mod = await import("../instrumentation");
    await mod.register();
    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });

  it("does not exit when all required vars are set with valid values", async () => {
    vi.resetModules();
    process.env.NEXT_RUNTIME = "nodejs";
    delete process.env.SKIP_ENV_VALIDATION;
    process.env.DATABASE_URL = "postgres://x:y@z/db";
    process.env.ENCRYPTION_KEY = "0".repeat(64);
    process.env.NEXTAUTH_SECRET = "a".repeat(32);
    process.env.API_KEY_HMAC_SECRET = "b".repeat(64);
    delete process.env.BOOTSTRAP_ADMIN_EMAIL;
    delete process.env.BOOTSTRAP_ADMIN_PASSWORD;

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
    const mod = await import("../instrumentation");
    await mod.register();
    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });
});
