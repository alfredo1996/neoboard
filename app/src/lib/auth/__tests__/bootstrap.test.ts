import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const loggedEvents: Array<{
  level: string;
  obj: Record<string, unknown>;
  msg: string;
}> = [];

const mockSelectLimit = vi.fn();
const mockInsertValues = vi.fn();
const mockInsert = vi.fn(() => ({ values: mockInsertValues }));
// Second arg (the { isolationLevel } options object) is ignored by the fake but
// still recorded on mockTransaction.mock.calls, which is what pins it below.
const mockTransaction = vi.fn(
  async (
    fn: (tx: {
      select: () => { from: () => { limit: () => Promise<unknown[]> } };
      insert: () => { values: (v: unknown) => Promise<void> };
    }) => Promise<void>,
  ) => {
    await fn({
      select: () => ({
        from: () => ({ limit: () => mockSelectLimit() }),
      }),
      insert: mockInsert,
    });
  },
);

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn(async () => "hashed"),
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    transaction: (...args: unknown[]) =>
      (mockTransaction as unknown as (...a: unknown[]) => Promise<void>)(
        ...args,
      ),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  users: { id: "id" },
}));

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

import { bootstrapAdmin } from "../bootstrap";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("bootstrapAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loggedEvents.length = 0;
    delete process.env.TENANT_ID;
    // Every test that cares sets its own value; this keeps the suite
    // independent of declaration order (#1630 runs suites shuffled).
    mockSelectLimit.mockResolvedValue([]);
    mockInsertValues.mockResolvedValue(undefined);
  });

  it("throws when password is shorter than 8 characters", async () => {
    await expect(
      bootstrapAdmin({ email: "a@b.c", password: "abc1" }),
    ).rejects.toThrow(/at least 8 characters/);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("throws when password has no letter", async () => {
    await expect(
      bootstrapAdmin({ email: "a@b.c", password: "12345678" }),
    ).rejects.toThrow("at least one letter and one number");
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("throws when password has no digit", async () => {
    await expect(
      bootstrapAdmin({ email: "a@b.c", password: "abcdefgh" }),
    ).rejects.toThrow("at least one letter and one number");
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("is a no-op when users already exist (no insert, no log)", async () => {
    mockSelectLimit.mockResolvedValue([{ id: "existing-user" }]);

    await bootstrapAdmin({ email: "a@b.c", password: "secret12" });

    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockInsertValues).not.toHaveBeenCalled();
    expect(
      loggedEvents.some((e) => e.msg === "admin_bootstrap_succeeded"),
    ).toBe(false);
  });

  it("inserts admin and logs admin_bootstrap_succeeded when users table is empty", async () => {
    mockSelectLimit.mockResolvedValue([]);

    await bootstrapAdmin({ email: "admin@example.com", password: "secret12" });

    expect(mockInsert).toHaveBeenCalledOnce();
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "admin@example.com",
        role: "admin",
        tenantId: "default",
      }),
    );
    const entry = loggedEvents.find(
      (e) => e.msg === "admin_bootstrap_succeeded",
    );
    expect(entry).toBeDefined();
    expect(entry?.level).toBe("info");
    // Verify the transaction uses serializable isolation to prevent TOCTOU races
    expect(mockTransaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: "serializable" }),
    );
  });

  it("honours TENANT_ID env var when inserting the admin user", async () => {
    mockSelectLimit.mockResolvedValue([]);
    process.env.TENANT_ID = "tenant-xyz";

    await bootstrapAdmin({ email: "a@b.c", password: "secret12" });

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-xyz" }),
    );
  });
});
