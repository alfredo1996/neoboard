import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// vi.hoisted runs BEFORE vi.mock factories, so these are available there
// ---------------------------------------------------------------------------
const {
  callbacks,
  events,
  authorize,
  mockDbSelect,
  mockUpdateThen,
  mockSafeParse,
  loggedEvents,
} = vi.hoisted(() => {
  const callbacks = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jwt: null as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    session: null as any,
  };
  const events = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    signOut: null as any,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const authorize = { fn: null as any };
  const mockDbSelect = vi.fn();
  // Default: invoke success callback so the fire-and-forget lastLoginAt
  // update succeeds. Tests that want to exercise the rejection branch
  // override this with mockReturnValueOnce.
  const mockUpdateThen = vi.fn(
    (
      successCb: (value: unknown) => void,
      _errorCb?: (err: unknown) => void,
    ) => {
      void _errorCb;
      successCb(undefined);
    },
  );
  type SafeParseResult =
    | { success: true; data: { email: string; password: string } }
    | { success: false; error: unknown };
  const mockSafeParse = vi.fn<() => SafeParseResult>(() => ({
    success: true,
    data: { email: "a@b.c", password: "123456" },
  }));
  const loggedEvents: Array<{
    level: string;
    obj: Record<string, unknown>;
    msg: string;
  }> = [];
  return {
    callbacks,
    events,
    authorize,
    mockDbSelect,
    mockUpdateThen,
    mockSafeParse,
    loggedEvents,
  };
});

vi.mock("@/lib/logger", () => {
  const make = (level: string) => (obj: Record<string, unknown>, msg: string) =>
    loggedEvents.push({ level, obj, msg });
  const child = {
    info: make("info"),
    warn: make("warn"),
    error: make("error"),
    debug: make("debug"),
  };
  return {
    logger: child,
    authLogger: child,
    queryLogger: child,
    apiLogger: child,
  };
});

vi.mock("next-auth", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: (config: any) => {
    callbacks.jwt = config.callbacks.jwt;
    callbacks.session = config.callbacks.session;
    events.signOut = config.events?.signOut ?? null;
    authorize.fn = config.providers[0].authorize;
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
      set: () => ({
        where: () => ({
          then: (
            successCb: (value: unknown) => void,
            errorCb?: (err: unknown) => void,
          ) => mockUpdateThen(successCb, errorCb),
        }),
      }),
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

vi.mock("@/lib/crypto/rate-limiter", () => ({
  loginRateLimiter: { check: vi.fn(() => ({ allowed: true })) },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ field: a, value: b })),
}));

vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn() },
}));

vi.mock("zod", () => {
  const schema = { safeParse: mockSafeParse };
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

describe("Auth event logging", () => {
  beforeEach(() => {
    loggedEvents.length = 0;
  });

  describe("sign_in success", () => {
    it("logs sign_in with userId, tenantId, and requestId when authorize succeeds", async () => {
      mockDbRows([
        {
          id: "user-1",
          passwordHash: "hash",
          disabledAt: null,
          name: "Alice",
          email: "a@b.c",
          role: "admin",
          canWrite: true,
          forcePasswordChange: false,
          tenantId: "tenant-1",
          image: null,
        },
      ]);
      const bcrypt = (await import("bcryptjs")).default;
      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const req = {
        headers: {
          get: (name: string) => (name === "x-request-id" ? "req-123" : null),
        },
      };
      await authorize.fn({ email: "a@b.c", password: "abc" }, req);

      const signIn = loggedEvents.find((e) => e.msg === "sign_in");
      expect(signIn).toBeDefined();
      expect(signIn?.level).toBe("info");
      expect(signIn?.obj.userId).toBe("user-1");
      expect(signIn?.obj.tenantId).toBe("tenant-1");
      expect(signIn?.obj.requestId).toBe("req-123");
    });
  });

  describe("sign_in_failed", () => {
    it("logs invalid_input when the credentials schema rejects the payload", async () => {
      mockSafeParse.mockReturnValueOnce({
        success: false,
        error: {},
      });

      const result = await authorize.fn(
        { email: "not-an-email", password: "" },
        { headers: { get: () => null } },
      );

      expect(result).toBeNull();
      const entry = loggedEvents[0];
      expect(entry.msg).toBe("sign_in_failed");
      expect(entry.level).toBe("warn");
      expect(entry.obj.reason).toBe("invalid_input");
      expect(entry.obj.email).toBe("not-an-email");
    });

    it("logs last_login_update_failed when the lastLoginAt update rejects", async () => {
      mockDbRows([
        {
          id: "user-9",
          passwordHash: "hash",
          disabledAt: null,
          name: "Bob",
          email: "a@b.c",
          role: "creator",
          canWrite: true,
          forcePasswordChange: false,
          tenantId: "tenant-9",
          image: null,
        },
      ]);
      const bcrypt = (await import("bcryptjs")).default;
      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      // First call (lastLoginAt update) rejects; subsequent calls default.
      mockUpdateThen.mockImplementationOnce((_success, errorCb) => {
        errorCb?.(new Error("db down"));
      });

      await authorize.fn(
        { email: "a@b.c", password: "abc" },
        { headers: { get: () => null } },
      );

      const entry = loggedEvents.find(
        (e) => e.msg === "last_login_update_failed",
      );
      expect(entry).toBeDefined();
      expect(entry?.level).toBe("warn");
      expect(entry?.obj.userId).toBe("user-9");
    });

    it("logs rate_limited when the IP is throttled", async () => {
      const { loginRateLimiter } = await import("@/lib/crypto/rate-limiter");
      (loginRateLimiter.check as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        allowed: false,
      });

      const result = await authorize.fn(
        { email: "a@b.c", password: "abc" },
        { headers: { get: () => null } },
      );

      expect(result).toBeNull();
      const entry = loggedEvents[0];
      expect(entry.msg).toBe("sign_in_failed");
      expect(entry.level).toBe("warn");
      expect(entry.obj.reason).toBe("rate_limited");
      expect(entry.obj.email).toBe("a@b.c");
    });

    it("logs user_not_found when the email does not exist", async () => {
      mockDbRows([]);

      const result = await authorize.fn(
        { email: "a@b.c", password: "abc" },
        { headers: { get: () => null } },
      );

      expect(result).toBeNull();
      expect(loggedEvents[0].obj.reason).toBe("user_not_found");
    });

    it("logs user_disabled when the account is disabled", async () => {
      mockDbRows([
        {
          id: "u1",
          passwordHash: "h",
          disabledAt: new Date("2026-01-01"),
          email: "a@b.c",
          role: "reader",
          canWrite: false,
          tenantId: "t1",
        },
      ]);

      const result = await authorize.fn(
        { email: "a@b.c", password: "abc" },
        { headers: { get: () => null } },
      );

      expect(result).toBeNull();
      expect(loggedEvents[0].obj.reason).toBe("user_disabled");
    });

    it("logs bad_password when bcrypt compare fails", async () => {
      mockDbRows([
        {
          id: "u1",
          passwordHash: "h",
          disabledAt: null,
          email: "a@b.c",
          role: "reader",
          canWrite: true,
          tenantId: "t1",
        },
      ]);
      const bcrypt = (await import("bcryptjs")).default;
      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      const result = await authorize.fn(
        { email: "a@b.c", password: "abc" },
        { headers: { get: () => null } },
      );

      expect(result).toBeNull();
      expect(loggedEvents[0].obj.reason).toBe("bad_password");
    });

    it("never includes the password in failure logs", async () => {
      mockDbRows([]);
      await authorize.fn(
        { email: "a@b.c", password: "super-secret" },
        { headers: { get: () => null } },
      );
      const entry = loggedEvents[0];
      const serialised = JSON.stringify(entry);
      expect(serialised).not.toContain("super-secret");
    });
  });

  describe("sign_out event", () => {
    it("logs sign_out with userId when the token carries an id", async () => {
      await events.signOut({ token: { id: "user-42" } });
      const entry = loggedEvents[0];
      expect(entry.msg).toBe("sign_out");
      expect(entry.level).toBe("info");
      expect(entry.obj.userId).toBe("user-42");
    });

    it("logs sign_out with undefined userId when token is absent", async () => {
      await events.signOut({ session: { user: {} } });
      expect(loggedEvents[0].obj.userId).toBeUndefined();
    });
  });
});
