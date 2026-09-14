import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  makeSelectChain as recordingSelectChain,
  resetDbMock,
  sqlColumns,
  sqlValues,
} from "@/__tests__/helpers/drizzle-mocks";
import { makeParams } from "@/__tests__/helpers/request-helpers";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequireSession = vi.fn();

function makeSelectChain(rows: unknown[]) {
  return {
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(rows),
      }),
    }),
  };
}

function makeShareSelectChain(rows: unknown[]) {
  return {
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(rows),
      }),
    }),
  };
}

function makeInsertChain(rows: unknown[]) {
  return {
    values: () => ({
      returning: () => Promise.resolve(rows),
    }),
  };
}

let selectCallCount = 0;
const mockDb = {
  select: vi.fn(() => {
    selectCallCount++;
    // First select is for dashboard, second for shares
    if (selectCallCount === 1) return makeSelectChain([]);
    return makeShareSelectChain([]);
  }),
  insert: vi.fn(() => makeInsertChain([])),
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

vi.mock("@/lib/auth/session", () => ({ requireSession: mockRequireSession }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("next/server", () => nextResponseMockFactory());
vi.mock("@/lib/auth/errors", () => ({ UnauthorizedError, ForbiddenError }));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/dashboards/[id]/duplicate", () => {
  let POST: (
    req: Request,
    ctx: { params: Promise<{ id: string }> },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    // Drain return values a refused request left queued (#1630).
    resetDbMock(mockDb);
    selectCallCount = 0;
    const mod = await import("../route");
    POST = mod.POST;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockRejectedValue(new UnauthorizedError());
    const res = await POST({} as Request, makeParams("d1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when caller is reader", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "u1",
      role: "reader",
      canWrite: false,
      tenantId: "default",
    });
    const res = await POST({} as Request, makeParams("d1"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.message).toBe("Forbidden");
  });

  it("returns 404 when dashboard not found", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "u1",
      role: "creator",
      canWrite: true,
      tenantId: "default",
    });
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    const res = await POST({} as Request, makeParams("d1"));
    expect(res.status).toBe(404);
  });

  it("returns 201 and copies dashboard for owner", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "u1",
      role: "creator",
      canWrite: true,
      tenantId: "default",
    });
    const source = {
      id: "d1",
      userId: "u1",
      name: "My Dashboard",
      description: "desc",
      layoutJson: { version: 2, pages: [] },
      isPublic: true,
    };
    const copy = {
      ...source,
      id: "d2",
      name: "My Dashboard (copy)",
      isPublic: false,
    };
    mockDb.select.mockReturnValueOnce(makeSelectChain([source]));
    mockDb.insert.mockReturnValueOnce(makeInsertChain([copy]));

    const res = await POST({} as Request, makeParams("d1"));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.name).toBe("My Dashboard (copy)");
  });

  it("admin can duplicate any dashboard (bypasses ownership)", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "admin-1",
      role: "admin",
      canWrite: true,
      tenantId: "default",
    });
    const source = { id: "d1", userId: "other-user", name: "Other Dashboard" };
    const copy = { id: "d2", name: "Other Dashboard (copy)" };
    mockDb.select.mockReturnValueOnce(makeSelectChain([source]));
    mockDb.insert.mockReturnValueOnce(makeInsertChain([copy]));

    const res = await POST({} as Request, makeParams("d1"));
    expect(res.status).toBe(201);
  });

  it("returns 404 when creator is not owner and has no share", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "u2",
      role: "creator",
      canWrite: true,
      tenantId: "default",
    });
    const source = { id: "d1", userId: "u1", name: "Other Dashboard" };
    // First select: dashboard found (owned by u1)
    mockDb.select.mockReturnValueOnce(makeSelectChain([source]));
    // Second select: no share entry for u2
    mockDb.select.mockReturnValueOnce(makeShareSelectChain([]));

    const res = await POST({} as Request, makeParams("d1"));
    expect(res.status).toBe(404);
  });

  it("allows duplication when creator has share entry", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "u2",
      role: "creator",
      canWrite: true,
      tenantId: "default",
    });
    const source = {
      id: "d1",
      userId: "u1",
      name: "Shared Dashboard",
      description: null,
      layoutJson: { version: 2, pages: [] },
    };
    const copy = { id: "d2", name: "Shared Dashboard (copy)" };
    // First select: dashboard found
    mockDb.select.mockReturnValueOnce(makeSelectChain([source]));
    // Second select: share entry exists
    mockDb.select.mockReturnValueOnce(
      makeShareSelectChain([{ id: "share-1" }]),
    );
    mockDb.insert.mockReturnValueOnce(makeInsertChain([copy]));

    const res = await POST({} as Request, makeParams("d1"));
    expect(res.status).toBe(201);
  });

  it("returns 403 when canWrite is false", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "u1",
      role: "creator",
      canWrite: false,
      tenantId: "default",
    });
    const res = await POST({} as Request, makeParams("d1"));
    expect(res.status).toBe(403);
  });

  // A copy is a dashboard the caller owns, and a dashboard's owner may run any
  // read query on the connections it names (#972). So every connection in the
  // source must be one the caller can already use: their own, one shared with
  // the tenant, or any for an admin (#1816).
  const SHARED_SOURCE = {
    id: "d1",
    userId: "u1",
    name: "Shared Dashboard",
    description: null,
    layoutJson: {
      version: 2,
      pages: [
        {
          id: "p1",
          title: "Page 1",
          widgets: [
            {
              id: "w1",
              chartType: "table",
              connectionId: "c-private",
              query: "MATCH (n) RETURN n",
            },
          ],
          gridLayout: [],
        },
      ],
    },
  };

  it("returns 403 when the source names a connection the caller cannot use (#1816)", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "u2",
      role: "creator",
      canWrite: true,
      tenantId: "default",
    });
    const connectionCheck = recordingSelectChain([{ id: "c-private" }]);
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([SHARED_SOURCE]))
      .mockReturnValueOnce(
        makeShareSelectChain([{ id: "share-1", role: "viewer" }]),
      )
      .mockReturnValueOnce(connectionCheck);
    mockDb.insert.mockReturnValueOnce(makeInsertChain([{ id: "d2" }]));

    const res = await POST({} as Request, makeParams("d1"));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.message).toMatch(/connection/i);
    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(connectionCheck.calls.where).toHaveLength(1);
    const [expr] = connectionCheck.calls.where[0];
    expect(sqlColumns(expr)).toEqual(
      expect.arrayContaining(["tenant_id", "id", "userId", "visibility"]),
    );
    expect(sqlValues(expr)).toEqual(
      expect.arrayContaining(["default", "c-private", "u2", "shared"]),
    );
  });

  it("copies a source whose connections the caller can all use (#1816)", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "u2",
      role: "creator",
      canWrite: true,
      tenantId: "default",
    });
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([SHARED_SOURCE]))
      .mockReturnValueOnce(
        makeShareSelectChain([{ id: "share-1", role: "viewer" }]),
      )
      .mockReturnValueOnce(recordingSelectChain([]));
    mockDb.insert.mockReturnValueOnce(makeInsertChain([{ id: "d2" }]));

    const res = await POST({} as Request, makeParams("d1"));

    expect(res.status).toBe(201);
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
  });
});
