import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSelectChain } from "@/__tests__/helpers/drizzle-mocks";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDb = {
  select: vi.fn(),
};
const mockDecrypt = vi.fn((s: string) => s.replace("encrypted:", ""));

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/crypto/crypto", () => ({ decrypt: mockDecrypt }));
vi.mock("@/lib/db/schema", () => ({
  ssoProviders: {
    id: "id",
    name: "name",
    protocol: "protocol",
    issuer: "issuer",
    clientId: "client_id",
    clientSecretEncrypted: "client_secret_encrypted",
    scopes: "scopes",
    claimMappings: "claim_mappings",
    autoProvision: "auto_provision",
    defaultRole: "default_role",
    enforceSso: "enforce_sso",
    enabled: "enabled",
    tenantId: "tenant_id",
  },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ field: a, value: b })),
  and: vi.fn((...args: unknown[]) => args),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("loadSsoProviders", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/lib/db", () => ({ db: mockDb }));
    vi.doMock("@/lib/crypto/crypto", () => ({ decrypt: mockDecrypt }));
    vi.doMock("@/lib/db/schema", () => ({
      ssoProviders: {
        id: "id",
        name: "name",
        protocol: "protocol",
        issuer: "issuer",
        clientId: "client_id",
        clientSecretEncrypted: "client_secret_encrypted",
        scopes: "scopes",
        claimMappings: "claim_mappings",
        autoProvision: "auto_provision",
        defaultRole: "default_role",
        enforceSso: "enforce_sso",
        enabled: "enabled",
        tenantId: "tenant_id",
      },
    }));
    vi.doMock("drizzle-orm", () => ({
      eq: vi.fn((a: unknown, b: unknown) => ({ field: a, value: b })),
      and: vi.fn((...args: unknown[]) => args),
    }));
  });

  it("returns empty array when no providers configured", async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const { loadSsoProviders } = await import("../provider-loader");
    const providers = await loadSsoProviders("default");
    expect(providers).toEqual([]);
  });

  it("returns OIDC provider configs for enabled providers", async () => {
    const dbRow = {
      id: "sso-1",
      name: "Company SSO",
      protocol: "oidc",
      issuer: "https://idp.example.com",
      clientId: "client-123",
      clientSecretEncrypted: "encrypted:secret-456",
      scopes: "openid profile email",
      claimMappings: {
        claimKey: "groups",
        adminValue: "admins",
      },
      autoProvision: true,
      defaultRole: "creator",
      enforceSso: false,
      enabled: true,
    };
    mockDb.select.mockReturnValue(makeSelectChain([dbRow]));

    const { loadSsoProviders } = await import("../provider-loader");
    const providers = await loadSsoProviders("default");

    expect(providers).toHaveLength(1);
    const p = providers[0];
    expect(p.id).toBe("sso-sso-1");
    expect(p.name).toBe("Company SSO");
    expect(p.type).toBe("oidc");
    expect(p.issuer).toBe("https://idp.example.com");
    expect(p.clientId).toBe("client-123");
    expect(p.clientSecret).toBe("secret-456");
  });

  it("decrypts client secret", async () => {
    const dbRow = {
      id: "sso-1",
      name: "SSO",
      protocol: "oidc",
      issuer: "https://idp.example.com",
      clientId: "c",
      clientSecretEncrypted: "encrypted:my-secret",
      scopes: "openid",
      claimMappings: null,
      autoProvision: true,
      defaultRole: "creator",
      enforceSso: false,
      enabled: true,
    };
    mockDb.select.mockReturnValue(makeSelectChain([dbRow]));

    const { loadSsoProviders } = await import("../provider-loader");
    const providers = await loadSsoProviders("default");

    expect(mockDecrypt).toHaveBeenCalledWith("encrypted:my-secret");
    expect(providers[0].clientSecret).toBe("my-secret");
  });

  it("attaches metadata (claimMappings, autoProvision, defaultRole) to provider", async () => {
    const dbRow = {
      id: "sso-1",
      name: "SSO",
      protocol: "oidc",
      issuer: "https://idp.example.com",
      clientId: "c",
      clientSecretEncrypted: "encrypted:s",
      scopes: "openid profile email",
      claimMappings: { claimKey: "groups", adminValue: "admins" },
      autoProvision: false,
      defaultRole: "reader",
      enforceSso: true,
      enabled: true,
    };
    mockDb.select.mockReturnValue(makeSelectChain([dbRow]));

    const { loadSsoProviders } = await import("../provider-loader");
    const providers = await loadSsoProviders("default");

    expect(providers[0].metadata).toEqual({
      claimMappings: { claimKey: "groups", adminValue: "admins" },
      autoProvision: false,
      defaultRole: "reader",
      enforceSso: true,
    });
  });

  it("prefixes provider id with sso- to avoid collisions", async () => {
    const dbRow = {
      id: "my-provider",
      name: "Test",
      protocol: "oidc",
      issuer: "https://idp.example.com",
      clientId: "c",
      clientSecretEncrypted: "encrypted:s",
      scopes: "openid",
      claimMappings: null,
      autoProvision: true,
      defaultRole: "creator",
      enforceSso: false,
      enabled: true,
    };
    mockDb.select.mockReturnValue(makeSelectChain([dbRow]));

    const { loadSsoProviders } = await import("../provider-loader");
    const providers = await loadSsoProviders("default");

    expect(providers[0].id).toBe("sso-my-provider");
  });
});
