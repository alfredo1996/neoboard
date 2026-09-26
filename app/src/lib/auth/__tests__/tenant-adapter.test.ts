import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  makeSelectChain,
  resetDbMock,
  sqlColumns,
  sqlValues,
} from "@/__tests__/helpers/drizzle-mocks";

const { mockDb, base } = vi.hoisted(() => ({
  mockDb: { select: vi.fn() },
  base: {
    createUser: vi.fn(async (user: Record<string, unknown>) => user),
    getUserByEmail: vi.fn(),
    getUserByAccount: vi.fn(),
    linkAccount: vi.fn(),
  },
}));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@auth/drizzle-adapter", () => ({ DrizzleAdapter: () => base }));

import { tenantScopedAdapter } from "../tenant-adapter";

// The Drizzle adapter finds users by email or by linked account alone and
// creates them with no tenant, so an SSO sign-in could link to, or land in,
// another tenant's user with the same address (#2018).
describe("tenantScopedAdapter (#2018)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDbMock(mockDb);
  });

  it("finds a user by email only in its own tenant", async () => {
    const chain = makeSelectChain([{ id: "u1" }]);
    mockDb.select.mockReturnValueOnce(chain);

    const user =
      await tenantScopedAdapter("tenant-b").getUserByEmail!("alice@x.com");

    expect(user).toEqual({ id: "u1" });
    const [expr] = chain.calls.where[0];
    expect(sqlColumns(expr)).toEqual(
      expect.arrayContaining(["email", "tenant_id"]),
    );
    expect(sqlValues(expr)).toEqual(
      expect.arrayContaining(["alice@x.com", "tenant-b"]),
    );
    expect(base.getUserByEmail).not.toHaveBeenCalled();
  });

  it("answers null when no user in its tenant has the address", async () => {
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));

    expect(
      await tenantScopedAdapter("tenant-b").getUserByEmail!("alice@x.com"),
    ).toBeNull();
  });

  it("finds a linked account's user only in its own tenant", async () => {
    const chain = makeSelectChain([{ user: { id: "u1" } }]);
    mockDb.select.mockReturnValueOnce(chain);

    const user = await tenantScopedAdapter("tenant-b").getUserByAccount!({
      provider: "sso-p1",
      providerAccountId: "sub-1",
    });

    expect(user).toEqual({ id: "u1" });
    const [expr] = chain.calls.where[0];
    expect(sqlColumns(expr)).toEqual(
      expect.arrayContaining(["provider", "providerAccountId", "tenant_id"]),
    );
    expect(sqlValues(expr)).toEqual(
      expect.arrayContaining(["sso-p1", "sub-1", "tenant-b"]),
    );
    expect(base.getUserByAccount).not.toHaveBeenCalled();
  });

  it("answers null for an account linked to a user in another tenant", async () => {
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));

    expect(
      await tenantScopedAdapter("tenant-b").getUserByAccount!({
        provider: "sso-p1",
        providerAccountId: "sub-1",
      }),
    ).toBeNull();
  });

  it("creates a user in its own tenant", async () => {
    const user = {
      id: "u2",
      email: "alice@x.com",
      emailVerified: null,
    };

    await tenantScopedAdapter("tenant-b").createUser!(user);

    expect(base.createUser).toHaveBeenCalledWith({
      ...user,
      tenantId: "tenant-b",
    });
  });

  it("keeps the adapter's other methods", () => {
    expect(tenantScopedAdapter("tenant-b").linkAccount).toBe(base.linkAccount);
  });
});
