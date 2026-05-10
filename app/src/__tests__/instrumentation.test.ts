import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockBootstrapAdmin =
  vi.fn<(opts: { email: string; password: string }) => Promise<void>>();
const mockValidateEnvConfig = vi.fn();

vi.mock("@/lib/auth/bootstrap", () => ({
  bootstrapAdmin: mockBootstrapAdmin,
}));

vi.mock("@/lib/env-config", () => ({
  validateEnvConfig: mockValidateEnvConfig,
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("register (instrumentation hook)", () => {
  let register: () => Promise<void>;

  const savedRuntime = process.env.NEXT_RUNTIME;
  const savedEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const savedPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/lib/auth/bootstrap", () => ({
      bootstrapAdmin: mockBootstrapAdmin,
    }));
    vi.doMock("@/lib/env-config", () => ({
      validateEnvConfig: mockValidateEnvConfig,
    }));
    mockValidateEnvConfig.mockReturnValue({
      status: "ok",
      errors: [],
      warnings: [],
      config: {},
    });
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

  it("calls validateEnvConfig on startup", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    await register();
    expect(mockValidateEnvConfig).toHaveBeenCalledTimes(1);
  });

  it("logs errors from env validation", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockValidateEnvConfig.mockReturnValue({
      status: "error",
      errors: [
        {
          key: "DATABASE_URL",
          level: "error",
          message: "Required variable DATABASE_URL is not set",
        },
      ],
      warnings: [],
      config: {},
    });
    await register();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("DATABASE_URL"));
    spy.mockRestore();
  });

  it("logs warnings from env validation", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockValidateEnvConfig.mockReturnValue({
      status: "degraded",
      errors: [],
      warnings: [
        {
          key: "OIDC_CLIENT_ID",
          level: "warning",
          message: "OIDC_CLIENT_ID is missing",
        },
      ],
      config: {},
    });
    await register();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("OIDC_CLIENT_ID"));
    spy.mockRestore();
  });

  it("does not crash when env validation throws", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockValidateEnvConfig.mockImplementation(() => {
      throw new Error("validation boom");
    });
    await expect(register()).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to validate"),
      expect.stringContaining("validation boom"),
    );
    spy.mockRestore();
  });
});
