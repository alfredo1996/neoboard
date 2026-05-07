import { describe, it, expect, vi, beforeEach } from "vitest";

describe("loadEnvSsoProvider", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("returns null when no OIDC env vars are set", async () => {
    vi.stubEnv("OIDC_ISSUER", "");
    vi.stubEnv("OIDC_CLIENT_ID", "");
    vi.stubEnv("OIDC_CLIENT_SECRET", "");
    const { loadEnvSsoProvider } = await import("../env-provider");
    expect(loadEnvSsoProvider()).toBeNull();
  });

  it("returns null when only OIDC_ISSUER is set", async () => {
    vi.stubEnv("OIDC_ISSUER", "https://idp.example.com");
    vi.stubEnv("OIDC_CLIENT_ID", "");
    vi.stubEnv("OIDC_CLIENT_SECRET", "");
    const { loadEnvSsoProvider } = await import("../env-provider");
    expect(loadEnvSsoProvider()).toBeNull();
  });

  it("returns null when OIDC_CLIENT_SECRET is missing", async () => {
    vi.stubEnv("OIDC_ISSUER", "https://idp.example.com");
    vi.stubEnv("OIDC_CLIENT_ID", "neoboard");
    vi.stubEnv("OIDC_CLIENT_SECRET", "");
    const { loadEnvSsoProvider } = await import("../env-provider");
    expect(loadEnvSsoProvider()).toBeNull();
  });

  it("returns provider when all required vars are set", async () => {
    vi.stubEnv("OIDC_ISSUER", "https://idp.example.com");
    vi.stubEnv("OIDC_CLIENT_ID", "neoboard");
    vi.stubEnv("OIDC_CLIENT_SECRET", "secret123");
    const { loadEnvSsoProvider } = await import("../env-provider");
    const provider = loadEnvSsoProvider();

    expect(provider).not.toBeNull();
    expect(provider!.id).toBe("sso-env-oidc");
    expect(provider!.type).toBe("oidc");
    expect(provider!.issuer).toBe("https://idp.example.com");
    expect(provider!.clientId).toBe("neoboard");
    expect(provider!.clientSecret).toBe("secret123");
  });

  it("uses default display name when OIDC_DISPLAY_NAME is not set", async () => {
    vi.stubEnv("OIDC_ISSUER", "https://idp.example.com");
    vi.stubEnv("OIDC_CLIENT_ID", "neoboard");
    vi.stubEnv("OIDC_CLIENT_SECRET", "secret123");
    const { loadEnvSsoProvider } = await import("../env-provider");
    const provider = loadEnvSsoProvider();
    expect(provider!.name).toBe("SSO");
  });

  it("uses custom display name from OIDC_DISPLAY_NAME", async () => {
    vi.stubEnv("OIDC_ISSUER", "https://idp.example.com");
    vi.stubEnv("OIDC_CLIENT_ID", "neoboard");
    vi.stubEnv("OIDC_CLIENT_SECRET", "secret123");
    vi.stubEnv("OIDC_DISPLAY_NAME", "Company SSO");
    const { loadEnvSsoProvider } = await import("../env-provider");
    const provider = loadEnvSsoProvider();
    expect(provider!.name).toBe("Company SSO");
  });

  it("uses default scopes when OIDC_SCOPES is not set", async () => {
    vi.stubEnv("OIDC_ISSUER", "https://idp.example.com");
    vi.stubEnv("OIDC_CLIENT_ID", "neoboard");
    vi.stubEnv("OIDC_CLIENT_SECRET", "secret123");
    const { loadEnvSsoProvider } = await import("../env-provider");
    const provider = loadEnvSsoProvider();
    expect(provider!.authorization.params.scope).toBe("openid profile email");
  });

  it("builds claim mappings from OIDC_CLAIM_KEY and value vars", async () => {
    vi.stubEnv("OIDC_ISSUER", "https://idp.example.com");
    vi.stubEnv("OIDC_CLIENT_ID", "neoboard");
    vi.stubEnv("OIDC_CLIENT_SECRET", "secret123");
    vi.stubEnv("OIDC_CLAIM_KEY", "groups");
    vi.stubEnv("OIDC_ADMIN_VALUE", "neoboard-admins");
    vi.stubEnv("OIDC_CREATOR_VALUE", "neoboard-editors");
    vi.stubEnv("OIDC_READER_VALUE", "neoboard-viewers");
    const { loadEnvSsoProvider } = await import("../env-provider");
    const provider = loadEnvSsoProvider();
    expect(provider!.metadata.claimMappings).toEqual({
      claimKey: "groups",
      adminValue: "neoboard-admins",
      creatorValue: "neoboard-editors",
      readerValue: "neoboard-viewers",
    });
  });

  it("returns null claim mappings when OIDC_CLAIM_KEY is not set", async () => {
    vi.stubEnv("OIDC_ISSUER", "https://idp.example.com");
    vi.stubEnv("OIDC_CLIENT_ID", "neoboard");
    vi.stubEnv("OIDC_CLIENT_SECRET", "secret123");
    const { loadEnvSsoProvider } = await import("../env-provider");
    const provider = loadEnvSsoProvider();
    expect(provider!.metadata.claimMappings).toBeNull();
  });

  it("uses default auto-provision and role", async () => {
    vi.stubEnv("OIDC_ISSUER", "https://idp.example.com");
    vi.stubEnv("OIDC_CLIENT_ID", "neoboard");
    vi.stubEnv("OIDC_CLIENT_SECRET", "secret123");
    const { loadEnvSsoProvider } = await import("../env-provider");
    const provider = loadEnvSsoProvider();
    expect(provider!.metadata.autoProvision).toBe(true);
    expect(provider!.metadata.defaultRole).toBe("creator");
    expect(provider!.metadata.enforceSso).toBe(false);
  });

  it("respects OIDC_AUTO_PROVISION=false", async () => {
    vi.stubEnv("OIDC_ISSUER", "https://idp.example.com");
    vi.stubEnv("OIDC_CLIENT_ID", "neoboard");
    vi.stubEnv("OIDC_CLIENT_SECRET", "secret123");
    vi.stubEnv("OIDC_AUTO_PROVISION", "false");
    const { loadEnvSsoProvider } = await import("../env-provider");
    const provider = loadEnvSsoProvider();
    expect(provider!.metadata.autoProvision).toBe(false);
  });

  it("respects OIDC_DEFAULT_ROLE=reader", async () => {
    vi.stubEnv("OIDC_ISSUER", "https://idp.example.com");
    vi.stubEnv("OIDC_CLIENT_ID", "neoboard");
    vi.stubEnv("OIDC_CLIENT_SECRET", "secret123");
    vi.stubEnv("OIDC_DEFAULT_ROLE", "reader");
    const { loadEnvSsoProvider } = await import("../env-provider");
    const provider = loadEnvSsoProvider();
    expect(provider!.metadata.defaultRole).toBe("reader");
  });

  it("respects OIDC_ENFORCE_SSO=true", async () => {
    vi.stubEnv("OIDC_ISSUER", "https://idp.example.com");
    vi.stubEnv("OIDC_CLIENT_ID", "neoboard");
    vi.stubEnv("OIDC_CLIENT_SECRET", "secret123");
    vi.stubEnv("OIDC_ENFORCE_SSO", "true");
    const { loadEnvSsoProvider } = await import("../env-provider");
    const provider = loadEnvSsoProvider();
    expect(provider!.metadata.enforceSso).toBe(true);
  });

  it("includes allowDangerousEmailAccountLinking", async () => {
    vi.stubEnv("OIDC_ISSUER", "https://idp.example.com");
    vi.stubEnv("OIDC_CLIENT_ID", "neoboard");
    vi.stubEnv("OIDC_CLIENT_SECRET", "secret123");
    const { loadEnvSsoProvider } = await import("../env-provider");
    const provider = loadEnvSsoProvider();
    expect(provider!.allowDangerousEmailAccountLinking).toBe(true);
  });
});
