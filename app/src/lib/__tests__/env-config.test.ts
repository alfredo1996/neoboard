import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("validateEnvConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Set all required vars to valid values
    process.env.DATABASE_URL =
      "postgresql://neoboard:neoboard@localhost:5432/neoboard";
    process.env.ENCRYPTION_KEY = "a".repeat(64);
    process.env.NEXTAUTH_SECRET = "b".repeat(32);
    process.env.NEXTAUTH_URL = "http://localhost:3000";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  async function loadAndValidate() {
    vi.resetModules();
    const mod = await import("../env-config");
    return mod.validateEnvConfig();
  }

  it("returns ok when all required vars are set", async () => {
    const result = await loadAndValidate();
    expect(result.status).toBe("ok");
    expect(result.errors).toHaveLength(0);
  });

  it("returns error when DATABASE_URL is missing", async () => {
    delete process.env.DATABASE_URL;
    const result = await loadAndValidate();
    expect(result.status).toBe("error");
    expect(result.errors).toContainEqual(
      expect.objectContaining({ key: "DATABASE_URL", level: "error" }),
    );
  });

  it("returns error when ENCRYPTION_KEY is missing", async () => {
    delete process.env.ENCRYPTION_KEY;
    const result = await loadAndValidate();
    expect(result.status).toBe("error");
    expect(result.errors).toContainEqual(
      expect.objectContaining({ key: "ENCRYPTION_KEY", level: "error" }),
    );
  });

  it("returns error when ENCRYPTION_KEY is not 64 hex chars", async () => {
    process.env.ENCRYPTION_KEY = "too-short";
    const result = await loadAndValidate();
    expect(result.status).toBe("error");
    expect(result.errors).toContainEqual(
      expect.objectContaining({ key: "ENCRYPTION_KEY", level: "error" }),
    );
  });

  it("returns error when NEXTAUTH_SECRET is missing", async () => {
    delete process.env.NEXTAUTH_SECRET;
    const result = await loadAndValidate();
    expect(result.status).toBe("error");
    expect(result.errors).toContainEqual(
      expect.objectContaining({ key: "NEXTAUTH_SECRET", level: "error" }),
    );
  });

  it("returns ok when optional vars are missing", async () => {
    delete process.env.TENANT_ID;
    delete process.env.NEOBOARD_EDITION;
    const result = await loadAndValidate();
    expect(result.status).toBe("ok");
  });

  it("warns when OIDC_ISSUER is set without OIDC_CLIENT_ID", async () => {
    process.env.NEOBOARD_EDITION = "enterprise";
    process.env.OIDC_ISSUER = "https://idp.example.com";
    delete process.env.OIDC_CLIENT_ID;
    delete process.env.OIDC_CLIENT_SECRET;
    const result = await loadAndValidate();
    expect(result.status).toBe("degraded");
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ key: "OIDC_CLIENT_ID" }),
    );
  });

  it("warns when OIDC is partially configured (issuer + id, no secret)", async () => {
    process.env.NEOBOARD_EDITION = "enterprise";
    process.env.OIDC_ISSUER = "https://idp.example.com";
    process.env.OIDC_CLIENT_ID = "client-123";
    delete process.env.OIDC_CLIENT_SECRET;
    const result = await loadAndValidate();
    expect(result.status).toBe("degraded");
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ key: "OIDC_CLIENT_SECRET" }),
    );
  });

  it("returns ok when OIDC is fully configured", async () => {
    process.env.NEOBOARD_EDITION = "enterprise";
    process.env.OIDC_ISSUER = "https://idp.example.com";
    process.env.OIDC_CLIENT_ID = "client-123";
    process.env.OIDC_CLIENT_SECRET = "secret-456";
    const result = await loadAndValidate();
    expect(result.status).toBe("ok");
  });

  it("returns config map with set/unset status (never values)", async () => {
    process.env.TENANT_ID = "my-tenant";
    const result = await loadAndValidate();
    expect(result.config.DATABASE_URL).toBe("set");
    expect(result.config.TENANT_ID).toBe("set");
    expect(result.config.OIDC_ISSUER).toBe("unset");
    // Must never leak actual values
    expect(Object.values(result.config)).not.toContain(
      process.env.DATABASE_URL,
    );
  });
});
