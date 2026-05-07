import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// vi.hoisted runs BEFORE vi.mock factories, so these are available there
// ---------------------------------------------------------------------------
const { callbacks, sessionConfig, mockDbSelect } = vi.hoisted(() => {
  const callbacks = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jwt: null as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    session: null as any,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionConfig = { strategy: "" as string, maxAge: 0 as any };
  const mockDbSelect = vi.fn();
  return { callbacks, sessionConfig, mockDbSelect };
});

vi.mock("next-auth", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: (configOrFn: any) => {
    // Support both static config and lazy init (async function)
    const resolve = async () => {
      const config =
        typeof configOrFn === "function" ? await configOrFn() : configOrFn;
      callbacks.jwt = config.callbacks.jwt;
      callbacks.session = config.callbacks.session;
      sessionConfig.strategy = config.session?.strategy;
      sessionConfig.maxAge = config.session?.maxAge;
    };
    resolve();
    return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() };
  },
}));

vi.mock("next-auth/providers/credentials", () => ({
  default: (opts: unknown) => opts,
}));

vi.mock("@auth/drizzle-adapter", () => ({
  DrizzleAdapter: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
    update: () => ({
      set: () => ({ where: () => ({ then: (cb: () => void) => cb() }) }),
    }),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  users: {
    id: "id",
    email: "email",
    role: "role",
    name: "name",
    canWrite: "canWrite",
    disabledAt: "disabledAt",
    forcePasswordChange: "forcePasswordChange",
    passwordHash: "passwordHash",
    passwordChangedAt: "passwordChangedAt",
    image: "image",
    lastLoginAt: "lastLoginAt",
    tenantId: "tenantId",
  },
  accounts: {},
  sessions: {},
  verificationTokens: {},
}));

vi.mock("@/lib/crypto/rate-limiter", () => ({
  loginRateLimiter: { check: vi.fn(() => ({ allowed: true })) },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ field: a, value: b })),
}));

vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn() },
}));

vi.mock("@/lib/auth/sso/provider-cache", () => ({
  getCachedSsoProviders: vi.fn(async () => []),
}));

vi.mock("@/lib/auth/sso/claim-mapping", () => ({
  resolveRoleFromClaims: vi.fn(() => "creator"),
}));

vi.mock("@/lib/auth/sso/provision", () => ({
  provisionOrLinkSsoUser: vi.fn(async () => null),
}));

vi.mock("zod", () => {
  const schema = {
    safeParse: vi.fn(() => ({
      success: true,
      data: { email: "a@b.c", password: "123456" },
    })),
  };
  return {
    z: {
      object: () => schema,
      string: () => ({ email: () => schema, min: () => schema }),
    },
  };
});

// Import triggers NextAuth() which captures callbacks via the async resolve()
import "../config";

// The lazy init runs asynchronously — give it time to resolve before tests
beforeAll(async () => {
  // Wait for the NextAuth mock's resolve() to complete
  await new Promise((r) => setTimeout(r, 50));
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helper: mock DB select chain returning given rows
// ---------------------------------------------------------------------------
function mockDbRows(rows: Record<string, unknown>[]) {
  mockDbSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          then: vi
            .fn()
            .mockImplementation(
              (cb: (rows: Record<string, unknown>[]) => void) => cb(rows),
            ),
        }),
      }),
    }),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("JWT callback", () => {
  it("copies name from user on initial login", async () => {
    const token: Record<string, unknown> = {};
    const user = {
      id: "u1",
      name: "Alice",
      role: "admin",
      canWrite: true,
      forcePasswordChange: false,
    };

    mockDbRows([
      {
        role: "admin",
        canWrite: true,
        disabledAt: null,
        forcePasswordChange: false,
        name: "Alice",
      },
    ]);

    const result = (await callbacks.jwt({ token, user })) as Record<
      string,
      unknown
    >;
    expect(result.name).toBe("Alice");
  });

  it("re-fetches name from DB on token refresh", async () => {
    const token: Record<string, unknown> = {
      id: "u1",
      name: "Old Name",
      role: "admin",
    };

    mockDbRows([
      {
        role: "admin",
        canWrite: true,
        disabledAt: null,
        forcePasswordChange: false,
        name: "Updated Name",
      },
    ]);

    const result = (await callbacks.jwt({ token })) as Record<string, unknown>;
    expect(result.name).toBe("Updated Name");
  });
});

describe("session callback", () => {
  it("copies name from token to session.user", async () => {
    const session = {
      user: { id: "", name: "", role: "", canWrite: true },
    } as Record<string, unknown>;
    const token = {
      id: "u1",
      name: "Alice",
      role: "admin",
      canWrite: true,
      forcePasswordChange: false,
      tenantId: "default",
    };

    const result = (await callbacks.session({ session, token })) as {
      user: Record<string, unknown>;
    };
    expect(result.user.name).toBe("Alice");
  });
});

describe("session config — maxAge", () => {
  it("sets JWT strategy with maxAge", () => {
    expect(sessionConfig.strategy).toBe("jwt");
    expect(typeof sessionConfig.maxAge).toBe("number");
    expect(sessionConfig.maxAge).toBeGreaterThan(0);
  });
});

describe("JWT callback — session invalidation on password change", () => {
  it("invalidates token when passwordChangedAt is after token.iat", async () => {
    // iat is in seconds, passwordChangedAt is a Date
    const iat = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
    const passwordChangedAt = new Date(); // just now

    const token: Record<string, unknown> = {
      id: "u1",
      iat,
      role: "admin",
    };

    mockDbRows([
      {
        role: "admin",
        canWrite: true,
        disabledAt: null,
        forcePasswordChange: false,
        name: "Alice",
        tenantId: "default",
        passwordChangedAt,
      },
    ]);

    const result = await callbacks.jwt({ token });
    expect(result).toBeNull();
  });

  it("does NOT invalidate token when passwordChangedAt is null (grandfathered)", async () => {
    const iat = Math.floor(Date.now() / 1000) - 3600;

    const token: Record<string, unknown> = {
      id: "u1",
      iat,
      role: "admin",
    };

    mockDbRows([
      {
        role: "admin",
        canWrite: true,
        disabledAt: null,
        forcePasswordChange: false,
        name: "Alice",
        tenantId: "default",
        passwordChangedAt: null,
      },
    ]);

    const result = (await callbacks.jwt({ token })) as Record<string, unknown>;
    expect(result).not.toBeNull();
    expect(result.role).toBe("admin");
  });

  it("does NOT invalidate token when passwordChangedAt is before token.iat", async () => {
    const iat = Math.floor(Date.now() / 1000); // now
    const passwordChangedAt = new Date(Date.now() - 7200 * 1000); // 2 hours ago

    const token: Record<string, unknown> = {
      id: "u1",
      iat,
      role: "creator",
    };

    mockDbRows([
      {
        role: "creator",
        canWrite: true,
        disabledAt: null,
        forcePasswordChange: false,
        name: "Bob",
        tenantId: "default",
        passwordChangedAt,
      },
    ]);

    const result = (await callbacks.jwt({ token })) as Record<string, unknown>;
    expect(result).not.toBeNull();
    expect(result.role).toBe("creator");
  });

  it("does NOT invalidate token within 30-second grace period after password change", async () => {
    // Simulates the current session right after a self-service password change:
    // iat is 10 seconds ago, passwordChangedAt is 5 seconds ago (within grace)
    const iat = Math.floor(Date.now() / 1000) - 10;
    const passwordChangedAt = new Date(Date.now() - 5000);

    const token: Record<string, unknown> = {
      id: "u1",
      iat,
      role: "admin",
    };

    mockDbRows([
      {
        role: "admin",
        canWrite: true,
        disabledAt: null,
        forcePasswordChange: false,
        name: "Alice",
        tenantId: "default",
        passwordChangedAt,
      },
    ]);

    const result = (await callbacks.jwt({ token })) as Record<string, unknown>;
    expect(result).not.toBeNull();
    expect(result.role).toBe("admin");
  });
});
