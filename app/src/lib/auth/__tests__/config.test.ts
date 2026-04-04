import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// vi.hoisted runs BEFORE vi.mock factories, so these are available there
// ---------------------------------------------------------------------------
const { callbacks, mockDbSelect } = vi.hoisted(() => {
  const callbacks = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jwt: null as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    session: null as any,
  };
  const mockDbSelect = vi.fn();
  return { callbacks, mockDbSelect };
});

vi.mock("next-auth", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: (config: any) => {
    callbacks.jwt = config.callbacks.jwt;
    callbacks.session = config.callbacks.session;
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
    image: "image",
    lastLoginAt: "lastLoginAt",
  },
  accounts: {},
  sessions: {},
  verificationTokens: {},
}));

vi.mock("@/lib/rate-limiter", () => ({
  loginRateLimiter: { check: vi.fn(() => ({ allowed: true })) },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ field: a, value: b })),
}));

vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn() },
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

// Import triggers NextAuth() which captures callbacks
import "../config";

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
          then: vi.fn().mockImplementation((cb: () => void) => cb(rows)),
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
