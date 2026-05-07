import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  makeSelectChain,
  makeInsertChain,
  makeUpdateChain,
} from "@/__tests__/helpers/drizzle-mocks";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
};

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/db/schema", () => ({
  users: {
    id: "id",
    email: "email",
    name: "name",
    role: "role",
    canWrite: "canWrite",
    tenantId: "tenantId",
    lastLoginAt: "lastLoginAt",
    image: "image",
    forcePasswordChange: "forcePasswordChange",
  },
  ssoProviders: {},
  userRoleEnum: {},
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ field: a, value: b })),
  and: vi.fn((...args: unknown[]) => args),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("provisionOrLinkSsoUser", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/lib/db", () => ({ db: mockDb }));
    vi.doMock("@/lib/db/schema", () => ({
      users: {
        id: "id",
        email: "email",
        name: "name",
        role: "role",
        canWrite: "canWrite",
        tenantId: "tenantId",
        lastLoginAt: "lastLoginAt",
        image: "image",
        forcePasswordChange: "forcePasswordChange",
      },
      ssoProviders: {},
      userRoleEnum: {},
    }));
    vi.doMock("drizzle-orm", () => ({
      eq: vi.fn((a: unknown, b: unknown) => ({ field: a, value: b })),
      and: vi.fn((...args: unknown[]) => args),
    }));
  });

  it("links existing user and updates role when user found by email", async () => {
    const existingUser = {
      id: "user-1",
      name: "Alice",
      email: "alice@example.com",
      role: "reader",
      canWrite: false,
      forcePasswordChange: false,
      tenantId: "default",
      image: null,
    };

    mockDb.select.mockReturnValue(makeSelectChain([existingUser]));
    mockDb.update.mockReturnValue(
      makeUpdateChain([{ ...existingUser, role: "admin" }]),
    );

    const { provisionOrLinkSsoUser } = await import("../provision");
    const result = await provisionOrLinkSsoUser({
      email: "alice@example.com",
      name: "Alice",
      image: null,
      resolvedRole: "admin",
      tenantId: "default",
      autoProvision: true,
    });

    expect(result).not.toBeNull();
    expect(result!.id).toBe("user-1");
    expect(mockDb.update).toHaveBeenCalled();
  });

  it("creates new user when no existing user and autoProvision is true", async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]));

    const newUser = {
      id: "new-user",
      name: "Bob",
      email: "bob@example.com",
      role: "creator",
      canWrite: true,
      forcePasswordChange: false,
      tenantId: "default",
      image: null,
    };
    mockDb.insert.mockReturnValue(makeInsertChain([newUser]));

    const { provisionOrLinkSsoUser } = await import("../provision");
    const result = await provisionOrLinkSsoUser({
      email: "bob@example.com",
      name: "Bob",
      image: null,
      resolvedRole: "creator",
      tenantId: "default",
      autoProvision: true,
    });

    expect(result).not.toBeNull();
    expect(result!.email).toBe("bob@example.com");
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it("returns null when no existing user and autoProvision is false", async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]));

    const { provisionOrLinkSsoUser } = await import("../provision");
    const result = await provisionOrLinkSsoUser({
      email: "unknown@example.com",
      name: "Unknown",
      image: null,
      resolvedRole: "creator",
      tenantId: "default",
      autoProvision: false,
    });

    expect(result).toBeNull();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("updates lastLoginAt on existing user", async () => {
    const existingUser = {
      id: "user-1",
      name: "Alice",
      email: "alice@example.com",
      role: "creator",
      canWrite: true,
      forcePasswordChange: false,
      tenantId: "default",
      image: null,
    };

    mockDb.select.mockReturnValue(makeSelectChain([existingUser]));

    let capturedSet: Record<string, unknown> | null = null;
    const updateChain = {
      set: (vals: Record<string, unknown>) => {
        capturedSet = vals;
        return updateChain;
      },
      where: () => Promise.resolve([existingUser]),
      returning: () => Promise.resolve([existingUser]),
    };
    mockDb.update.mockReturnValue(updateChain);

    const { provisionOrLinkSsoUser } = await import("../provision");
    await provisionOrLinkSsoUser({
      email: "alice@example.com",
      name: "Alice",
      image: null,
      resolvedRole: "creator",
      tenantId: "default",
      autoProvision: true,
    });

    expect(capturedSet).not.toBeNull();
    expect(capturedSet!.lastLoginAt).toBeInstanceOf(Date);
  });

  it("sets canWrite based on role for new users", async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]));

    let capturedValues: Record<string, unknown> | null = null;
    const insertChain = {
      values: (vals: Record<string, unknown>) => {
        capturedValues = vals;
        return insertChain;
      },
      returning: () =>
        Promise.resolve([
          {
            id: "new",
            email: "test@example.com",
            name: "Test",
            role: "reader",
            canWrite: false,
            forcePasswordChange: false,
            tenantId: "default",
            image: null,
          },
        ]),
    };
    mockDb.insert.mockReturnValue(insertChain);

    const { provisionOrLinkSsoUser } = await import("../provision");
    await provisionOrLinkSsoUser({
      email: "test@example.com",
      name: "Test",
      image: null,
      resolvedRole: "reader",
      tenantId: "default",
      autoProvision: true,
    });

    expect(capturedValues).not.toBeNull();
    // readers get canWrite=false
    expect(capturedValues!.canWrite).toBe(false);
    expect(capturedValues!.role).toBe("reader");
  });
});
