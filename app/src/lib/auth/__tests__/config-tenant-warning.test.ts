import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// #1338: the unset-TENANT_ID warning is a startup-configuration fact. It must
// be logged once when the module loads, not on every auth flow (the NextAuth
// factory below runs per flow so SSO providers can be reloaded).

const { warn, getCachedSsoProviders, factories } = vi.hoisted(() => ({
  warn: vi.fn(),
  getCachedSsoProviders: vi.fn(async (_tenantId: string) => []),
  factories: [] as Array<() => Promise<unknown>>,
}));

vi.mock("@/lib/logger", () => {
  const log = { warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() };
  return { logger: log, authLogger: log };
});

vi.mock("next-auth", () => ({
  default: (factory: () => Promise<unknown>) => {
    factories.push(factory);
    return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() };
  },
}));

vi.mock("next-auth/providers/credentials", () => ({
  default: (opts: unknown) => opts,
}));
vi.mock("@auth/drizzle-adapter", () => ({ DrizzleAdapter: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/db/schema", () => ({
  users: {},
  accounts: {},
  sessions: {},
  verificationTokens: {},
}));
vi.mock("@/lib/crypto/rate-limiter", () => ({
  loginRateLimiter: { check: vi.fn() },
}));
vi.mock("@/lib/auth/sso/provider-cache", () => ({ getCachedSsoProviders }));

const tenantWarnings = () =>
  warn.mock.calls.filter(([msg]) => String(msg).includes("TENANT_ID not set"));

/** Fresh module load, then run the per-flow factory `flows` times. */
async function loadAndRunFlows(flows: number) {
  vi.resetModules();
  factories.length = 0;
  await import("../config");
  expect(factories).toHaveLength(1);
  for (let i = 0; i < flows; i++) await factories[0]();
}

const originalTenantId = process.env.TENANT_ID;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  if (originalTenantId === undefined) delete process.env.TENANT_ID;
  else process.env.TENANT_ID = originalTenantId;
});

describe("TENANT_ID default warning (#1338)", () => {
  it("warns exactly once per module load when TENANT_ID is unset, however many auth flows run", async () => {
    delete process.env.TENANT_ID;

    await loadAndRunFlows(0);
    expect(tenantWarnings()).toHaveLength(1);

    for (let i = 0; i < 3; i++) await factories[0]();
    expect(tenantWarnings()).toHaveLength(1);
    expect(getCachedSsoProviders).toHaveBeenCalledTimes(3);
    for (const [tenantId] of getCachedSsoProviders.mock.calls) {
      expect(tenantId).toBe("default");
    }
  });

  it("warns once when TENANT_ID is the empty string the prod compose file passes", async () => {
    process.env.TENANT_ID = "";

    await loadAndRunFlows(3);

    expect(tenantWarnings()).toHaveLength(1);
  });

  it("never warns and uses the env value when TENANT_ID is set", async () => {
    process.env.TENANT_ID = "acme";

    await loadAndRunFlows(3);

    expect(tenantWarnings()).toHaveLength(0);
    expect(getCachedSsoProviders).toHaveBeenCalledTimes(3);
    for (const [tenantId] of getCachedSsoProviders.mock.calls) {
      expect(tenantId).toBe("acme");
    }
  });
});
