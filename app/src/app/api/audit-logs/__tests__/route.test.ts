import { describe, it, expect, vi, beforeEach } from "vitest";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";

const mockRequireSession = vi.fn();
const mockSelect = vi.fn();

vi.mock("@/lib/auth/session", () => ({ requireSession: mockRequireSession }));
vi.mock("@/lib/db", () => ({
  db: { select: mockSelect },
}));
vi.mock("@/lib/db/schema", () => ({
  auditLogs: {
    tenantId: "tenant_id",
    action: "action",
    userId: "user_id",
    resourceType: "resource_type",
    createdAt: "created_at",
  },
}));
vi.mock("next/server", () => nextResponseMockFactory());

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/audit-logs");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

function drizzleSelectChain(rows: unknown[], count = rows.length) {
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    offset: () => Promise.resolve(rows),
    then: (resolve: (v: unknown[]) => unknown) =>
      Promise.resolve(rows).then(resolve),
  };
  // Second call returns count
  const countChain = {
    from: () => countChain,
    where: () => countChain,
    then: (resolve: (v: unknown[]) => unknown) =>
      Promise.resolve([{ count }]).then(resolve),
  };
  let callCount = 0;
  return () => {
    callCount++;
    return callCount === 1 ? chain : countChain;
  };
}

describe("GET /api/audit-logs", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let GET: (req: Request) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/lib/auth/session", () => ({
      requireSession: mockRequireSession,
    }));
    vi.doMock("next/server", () => nextResponseMockFactory());

    const selectFn = drizzleSelectChain(
      [{ id: "log-1", action: "dashboard.create", userId: "user-1" }],
      1,
    );
    vi.doMock("@/lib/db", () => ({
      db: { select: selectFn },
    }));

    const mod = await import("../route");
    GET = mod.GET;
  });

  it("returns 403 for non-admin users", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      tenantId: "tenant-a",
      role: "creator",
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });

  it("returns audit logs for admin", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "admin-1",
      tenantId: "tenant-a",
      role: "admin",
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].action).toBe("dashboard.create");
  });

  it("supports pagination parameters", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "admin-1",
      tenantId: "tenant-a",
      role: "admin",
    });
    const res = await GET(makeRequest({ page: "2", limit: "10" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.meta.offset).toBe(10);
    expect(body.meta.limit).toBe(10);
  });
});
