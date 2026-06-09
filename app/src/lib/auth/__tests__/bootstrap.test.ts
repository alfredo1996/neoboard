import { describe, it, expect, vi, beforeEach } from "vitest";

const loggedEvents: Array<{
  level: string;
  obj: Record<string, unknown>;
  msg: string;
}> = [];

const mockSelectLimit = vi.fn();
const mockInsertValues = vi.fn();

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn(async () => "hashed"),
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    transaction: async (
      fn: (tx: {
        select: () => { from: () => { limit: () => Promise<unknown[]> } };
        insert: () => { values: (v: unknown) => Promise<void> };
      }) => Promise<void>,
    ) => {
      const tx = {
        select: () => ({
          from: () => ({ limit: () => mockSelectLimit() }),
        }),
        insert: () => ({ values: (v: unknown) => mockInsertValues(v) }),
      };
      await fn(tx);
    },
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

describe("bootstrapAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loggedEvents.length = 0;
    delete process.env.TENANT_ID;
  });

  it("throws when password is shorter than 8 characters", async () => {
    await expect(
      bootstrapAdmin({ email: "a@b.c", password: "abc1" }),
    ).rejects.toThrow(/at least 8 characters/);
  });

  it("throws when password has no letter", async () => {
    await expect(
      bootstrapAdmin({ email: "a@b.c", password: "12345678" }),
    ).rejects.toThrow(/at least 8 characters/);
  });

  it("throws when password has no digit", async () => {
    await expect(
      bootstrapAdmin({ email: "a@b.c", password: "abcdefgh" }),
    ).rejects.toThrow(/at least 8 characters/);
  });

  it("is a no-op when users already exist (no insert, no log)", async () => {
    mockSelectLimit.mockResolvedValue([{ id: "existing-user" }]);

    await bootstrapAdmin({ email: "a@b.c", password: "secret12" });

    expect(mockInsertValues).not.toHaveBeenCalled();
    expect(
      loggedEvents.some((e) => e.msg === "admin_bootstrap_succeeded"),
    ).toBe(false);
  });

  it("inserts admin and logs admin_bootstrap_succeeded when users table is empty", async () => {
    mockSelectLimit.mockResolvedValue([]);
    mockInsertValues.mockResolvedValue(undefined);

    await bootstrapAdmin({ email: "admin@example.com", password: "secret12" });

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
  });

  it("honours TENANT_ID env var when inserting the admin user", async () => {
    mockSelectLimit.mockResolvedValue([]);
    mockInsertValues.mockResolvedValue(undefined);
    process.env.TENANT_ID = "tenant-xyz";

    await bootstrapAdmin({ email: "a@b.c", password: "secret12" });

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-xyz" }),
    );
  });

  it("falls back to name 'Admin' when no name is provided", async () => {
    mockSelectLimit.mockResolvedValue([]);
    mockInsertValues.mockResolvedValue(undefined);

    await bootstrapAdmin({ email: "a@b.c", password: "secret12" });

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Admin" }),
    );
  });

  it("uses the provided name when supplied", async () => {
    mockSelectLimit.mockResolvedValue([]);
    mockInsertValues.mockResolvedValue(undefined);

    await bootstrapAdmin({
      email: "a@b.c",
      password: "secret12",
      name: "Founder McFounderface",
    });

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Founder McFounderface" }),
    );
  });

  it("uses the provided tenantId over TENANT_ID env var", async () => {
    mockSelectLimit.mockResolvedValue([]);
    mockInsertValues.mockResolvedValue(undefined);
    process.env.TENANT_ID = "env-tenant";

    await bootstrapAdmin({
      email: "a@b.c",
      password: "secret12",
      tenantId: "explicit-tenant",
    });

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "explicit-tenant" }),
    );
  });

  it("ignores empty-string name (falls back to default)", async () => {
    mockSelectLimit.mockResolvedValue([]);
    mockInsertValues.mockResolvedValue(undefined);

    await bootstrapAdmin({
      email: "a@b.c",
      password: "secret12",
      name: "",
    });

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Admin" }),
    );
  });

  it("ignores empty-string tenantId (falls back to env/default)", async () => {
    mockSelectLimit.mockResolvedValue([]);
    mockInsertValues.mockResolvedValue(undefined);
    process.env.TENANT_ID = "env-tenant";

    await bootstrapAdmin({
      email: "a@b.c",
      password: "secret12",
      tenantId: "",
    });

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "env-tenant" }),
    );
  });
});
