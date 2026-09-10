import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  makeSelectChain,
  makeInsertChain,
  sqlColumns,
  sqlValues,
} from "@/__tests__/helpers/drizzle-mocks";
import { makeRequest } from "@/__tests__/helpers/request-helpers";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequireSession = vi.fn<
  () => Promise<{
    userId: string;
    role: string;
    canWrite: boolean;
    tenantId: string;
  }>
>();

const mockDb = {
  select: vi.fn(),
  selectDistinctOn: vi.fn(),
  insert: vi.fn(),
};

class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
  }
}
class ForbiddenError extends Error {
  constructor() {
    super("Forbidden");
  }
}

vi.mock("@/lib/auth/session", () => ({
  requireSession: mockRequireSession,
  requireUserId: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("next/server", () => nextResponseMockFactory());
vi.mock("@/lib/auth/errors", () => ({ UnauthorizedError, ForbiddenError }));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/dashboards", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let GET: (req: Request) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import("../route");
    GET = mod.GET;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockRejectedValue(new UnauthorizedError());
    const res = await GET(makeRequest({}, "http://localhost/api/dashboards"));
    expect(res.status).toBe(401);
  });

  it("returns owned dashboards with role=owner in envelope (creator role)", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      role: "creator",
      canWrite: true,
      tenantId: "tenant-x",
    });
    const row = {
      id: "d1",
      name: "My Dashboard",
      description: null,
      isPublic: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      ownerId: "user-1",
      shareRole: null,
      updatedByName: null,
    };
    // Non-admin: 1) count, 2) selectDistinctOn
    const countChain = makeSelectChain([{ count: 1 }]);
    const rowsChain = makeSelectChain([row]);
    mockDb.select.mockReturnValueOnce(countChain);
    mockDb.selectDistinctOn.mockReturnValueOnce(rowsChain);

    const res = await GET(makeRequest({}, "http://localhost/api/dashboards"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].role).toBe("owner");
    expect(body.meta).toEqual({ total: 1, limit: 25, offset: 0 });
    expect(body.error).toBeNull();

    // Both the count and the page query scope by the session tenant and, for
    // a creator, by the caller as owner (#1607). The share-side tenant filter
    // lives in the LEFT JOIN condition, which the chain does not record.
    for (const chain of [countChain, rowsChain]) {
      expect(chain.calls.where).toHaveLength(1);
      const [expr] = chain.calls.where[0];
      expect(sqlColumns(expr)).toEqual(
        expect.arrayContaining(["tenant_id", "userId"]),
      );
      expect(sqlValues(expr)).toEqual(
        expect.arrayContaining(["tenant-x", "user-1"]),
      );
    }
  });

  it("merges owned and shared dashboards (creator role)", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      role: "creator",
      canWrite: true,
      tenantId: "default",
    });
    const ownedRow = {
      id: "d1",
      name: "Own",
      description: null,
      isPublic: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      ownerId: "user-1",
      shareRole: null,
      updatedByName: null,
    };
    const sharedRow = {
      id: "d2",
      name: "Shared",
      description: null,
      isPublic: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      ownerId: "other-user",
      shareRole: "viewer",
      updatedByName: null,
    };
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 2 }]));
    mockDb.selectDistinctOn.mockReturnValueOnce(
      makeSelectChain([ownedRow, sharedRow]),
    );

    const res = await GET(makeRequest({}, "http://localhost/api/dashboards"));
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.data.find((d: { id: string }) => d.id === "d1")?.role).toBe(
      "owner",
    );
    expect(body.data.find((d: { id: string }) => d.id === "d2")?.role).toBe(
      "viewer",
    );
  });

  it("returns all tenant dashboards for admin role", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "admin-1",
      role: "admin",
      canWrite: true,
      tenantId: "tenant-x",
    });
    const ownedRow = {
      id: "d1",
      name: "My Dashboard",
      description: null,
      isPublic: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      ownerId: "admin-1",
    };
    const otherRow = {
      id: "d2",
      name: "Other Dashboard",
      description: null,
      isPublic: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      ownerId: "user-1",
    };
    // Admin path: 1) count query, 2) paginated select
    const countChain = makeSelectChain([{ count: 2 }]);
    const rowsChain = makeSelectChain([ownedRow, otherRow]);
    mockDb.select
      .mockReturnValueOnce(countChain)
      .mockReturnValueOnce(rowsChain);

    const res = await GET(makeRequest({}, "http://localhost/api/dashboards"));
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    // "Every dashboard" means every dashboard in the session tenant — both
    // admin queries must carry the tenant filter (#1607).
    for (const chain of [countChain, rowsChain]) {
      expect(chain.calls.where).toHaveLength(1);
      const [expr] = chain.calls.where[0];
      expect(sqlColumns(expr)).toEqual(["tenant_id"]);
      expect(sqlValues(expr)).toEqual(["tenant-x"]);
    }
    expect(body.data.find((d: { id: string }) => d.id === "d1")?.role).toBe(
      "owner",
    );
    expect(body.data.find((d: { id: string }) => d.id === "d2")?.role).toBe(
      "admin",
    );
    expect(body.meta.total).toBe(2);
    // ownerId is an internal identifier used only to compute `role`; it must
    // not leak into the admin list payload (parity with the non-admin branch).
    expect(
      body.data.every((d: Record<string, unknown>) => !("ownerId" in d)),
    ).toBe(true);
  });

  it("returns only assigned dashboards for reader role", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      role: "reader",
      canWrite: false,
      tenantId: "tenant-x",
    });
    const assignedRow = {
      id: "d1",
      name: "Assigned",
      description: null,
      isPublic: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      ownerId: "other-user",
      shareRole: "viewer",
      updatedByName: null,
    };
    const countChain = makeSelectChain([{ count: 1 }]);
    const rowsChain = makeSelectChain([assignedRow]);
    mockDb.select.mockReturnValueOnce(countChain);
    mockDb.selectDistinctOn.mockReturnValueOnce(rowsChain);

    const res = await GET(makeRequest({}, "http://localhost/api/dashboards"));
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe("d1");
    // A reader's access filter is share-or-public; the user scoping sits in
    // the share JOIN, so the WHERE must at least pin the tenant (#1607).
    for (const chain of [countChain, rowsChain]) {
      expect(chain.calls.where).toHaveLength(1);
      const [expr] = chain.calls.where[0];
      expect(sqlColumns(expr)).toContain("tenant_id");
      expect(sqlValues(expr)).toContain("tenant-x");
    }
  });

  it("includes public dashboards for creator role", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      role: "creator",
      canWrite: true,
      tenantId: "default",
    });
    const ownedRow = {
      id: "d1",
      name: "Own",
      description: null,
      isPublic: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      ownerId: "user-1",
      shareRole: null,
      updatedByName: null,
    };
    const publicRow = {
      id: "d2",
      name: "Public Demo",
      description: null,
      isPublic: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      ownerId: "other-user",
      shareRole: null,
      updatedByName: null,
    };
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 2 }]));
    mockDb.selectDistinctOn.mockReturnValueOnce(
      makeSelectChain([ownedRow, publicRow]),
    );

    const res = await GET(makeRequest({}, "http://localhost/api/dashboards"));
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.data.find((d: { id: string }) => d.id === "d1")?.role).toBe(
      "owner",
    );
    expect(body.data.find((d: { id: string }) => d.id === "d2")?.role).toBe(
      "viewer",
    );
  });

  it("deduplication handled by DB DISTINCT ON", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      role: "creator",
      canWrite: true,
      tenantId: "default",
    });
    // DB returns only 1 row (DISTINCT ON deduplicates at DB level)
    const row = {
      id: "d1",
      name: "Own",
      description: null,
      isPublic: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      ownerId: "user-1",
      shareRole: null,
      updatedByName: null,
    };
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 1 }]));
    mockDb.selectDistinctOn.mockReturnValueOnce(makeSelectChain([row]));

    const res = await GET(makeRequest({}, "http://localhost/api/dashboards"));
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe("d1");
  });

  it("includes public dashboards for reader role", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      role: "reader",
      canWrite: false,
      tenantId: "default",
    });
    const publicRow = {
      id: "d1",
      name: "Public Demo",
      description: null,
      isPublic: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      ownerId: "other-user",
      shareRole: null,
      updatedByName: null,
    };
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 1 }]));
    mockDb.selectDistinctOn.mockReturnValueOnce(makeSelectChain([publicRow]));

    const res = await GET(makeRequest({}, "http://localhost/api/dashboards"));
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe("d1");
    expect(body.data[0].role).toBe("viewer");
  });
});

describe("POST /api/dashboards", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let POST: (req: Request) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import("../route");
    POST = mod.POST;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockRejectedValue(new UnauthorizedError());
    const res = await POST(makeRequest({ name: "DB" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for reader role", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      role: "reader",
      canWrite: false,
      tenantId: "default",
    });
    const res = await POST(makeRequest({ name: "DB" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when name is missing", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      role: "creator",
      canWrite: true,
      tenantId: "default",
    });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("creates a dashboard and returns 201 envelope", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      role: "creator",
      canWrite: true,
      tenantId: "tenant-x",
    });
    const created = {
      id: "d1",
      name: "My Dashboard",
      userId: "user-1",
      createdAt: new Date(),
    };
    const chain = makeInsertChain([created]);
    mockDb.insert.mockReturnValue(chain);

    // A tenantId in the body must be ignored — the row is stamped with the
    // session tenant, never the request's (#1607).
    const res = await POST(
      makeRequest({ name: "My Dashboard", tenantId: "tenant-evil" }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data).toEqual(created);
    expect(body.error).toBeNull();
    // values[0] is the dashboard row; the audit log's own insert lands on the
    // same mocked chain afterwards.
    expect(chain.calls.values[0][0]).toMatchObject({
      tenantId: "tenant-x",
      userId: "user-1",
    });
  });

  it("sets updatedBy to session userId on create", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      role: "creator",
      canWrite: true,
      tenantId: "default",
    });
    const created = {
      id: "d1",
      name: "Test",
      userId: "user-1",
      updatedBy: "user-1",
    };
    const chain = makeInsertChain([created]);
    mockDb.insert.mockReturnValue(chain);

    const res = await POST(makeRequest({ name: "Test" }));
    expect(res.status).toBe(201);
    expect(chain.calls.values[0][0]).toMatchObject({ updatedBy: "user-1" });
  });

  it("persists tags — trimmed and deduped (#1692)", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      role: "creator",
      canWrite: true,
      tenantId: "default",
    });
    const chain = makeInsertChain([
      { id: "d1", name: "Tagged", tags: ["sales", "kpi"] },
    ]);
    mockDb.insert.mockReturnValue(chain);

    const res = await POST(
      makeRequest({ name: "Tagged", tags: [" sales ", "kpi", "sales"] }),
    );
    expect(res.status).toBe(201);
    expect(chain.calls.values[0][0]).toMatchObject({ tags: ["sales", "kpi"] });
  });

  it("returns 400 when tags exceed the limits (#1692)", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      role: "creator",
      canWrite: true,
      tenantId: "default",
    });
    const tooMany = Array.from({ length: 11 }, (_, i) => `t${i}`);
    expect(
      (await POST(makeRequest({ name: "Tagged", tags: tooMany }))).status,
    ).toBe(400);
    expect(
      (await POST(makeRequest({ name: "Tagged", tags: ["x".repeat(31)] })))
        .status,
    ).toBe(400);
    expect(
      (await POST(makeRequest({ name: "Tagged", tags: "sales" }))).status,
    ).toBe(400);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});

describe("GET /api/dashboards — updatedByName", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let GET: (req: Request) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import("../route");
    GET = mod.GET;
  });

  it("returns updatedByName from joined user for admin", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "admin-1",
      role: "admin",
      canWrite: true,
      tenantId: "default",
    });
    const row = {
      id: "d1",
      name: "Dashboard",
      description: null,
      isPublic: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      ownerId: "admin-1",
      updatedByName: "Alice",
    };
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([{ count: 1 }]))
      .mockReturnValueOnce(makeSelectChain([row]));

    const res = await GET(makeRequest({}, "http://localhost/api/dashboards"));
    expect(res.status).toBe(200);
    const body = res._body as { data: Array<{ updatedByName: string | null }> };
    expect(body.data[0].updatedByName).toBe("Alice");
  });

  it("returns updatedByName as null when no updater", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      role: "creator",
      canWrite: true,
      tenantId: "default",
    });
    const row = {
      id: "d1",
      name: "Dashboard",
      description: null,
      isPublic: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      ownerId: "user-1",
      shareRole: null,
      updatedByName: null,
    };
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 1 }]));
    mockDb.selectDistinctOn.mockReturnValueOnce(makeSelectChain([row]));

    const res = await GET(makeRequest({}, "http://localhost/api/dashboards"));
    expect(res.status).toBe(200);
    const body = res._body as { data: Array<{ updatedByName: string | null }> };
    expect(body.data[0].updatedByName).toBeNull();
  });
});
