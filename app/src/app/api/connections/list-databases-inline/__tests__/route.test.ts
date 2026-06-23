import { describe, it, expect, vi, beforeEach } from "vitest";
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
const mockListDatabases = vi.fn();
const mockListSchemas = vi.fn();

vi.mock("@/lib/auth/session", () => ({ requireSession: mockRequireSession }));
vi.mock("@/lib/query/query-executor", () => ({
  listDatabases: mockListDatabases,
  listSchemas: mockListSchemas,
}));
vi.mock("next/server", () => nextResponseMockFactory());
vi.mock("@/lib/auth/errors", () => ({
  UnauthorizedError: class extends Error {
    constructor() {
      super("Unauthorized");
    }
  },
  ForbiddenError: class extends Error {
    constructor() {
      super("Forbidden");
    }
  },
}));

const SESSION = {
  userId: "user-1",
  role: "creator",
  canWrite: true,
  tenantId: "t1",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/connections/list-databases-inline", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import("../route");
    POST = mod.POST;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockRejectedValue(new Error("Unauthorized"));
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(401);
  });

  it("returns 403 for readers — inline listing probes arbitrary hosts with arbitrary credentials (#971)", async () => {
    mockRequireSession.mockResolvedValue({
      ...SESSION,
      role: "reader",
      canWrite: false,
    });
    const res = await POST(
      makeRequest({
        type: "postgresql",
        config: {
          uri: "postgresql://10.0.0.1:5432/db",
          username: "u",
          password: "p",
        },
      }),
    );
    expect(res.status).toBe(403);
    expect(mockListDatabases).not.toHaveBeenCalled();
  });

  it("returns 400 for missing type", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const res = await POST(
      makeRequest({ config: { uri: "x", username: "u", password: "p" } }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid type", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const res = await POST(
      makeRequest({
        type: "mysql",
        config: { uri: "x", username: "u", password: "p" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns databases on success for neo4j", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockListDatabases.mockResolvedValue(["neo4j", "movies"]);

    const res = await POST(
      makeRequest({
        type: "neo4j",
        config: {
          uri: "bolt://localhost:7687",
          username: "neo4j",
          password: "pass",
        },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.databases).toEqual(["neo4j", "movies"]);
  });

  it("returns databases and schemas for postgresql", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockListDatabases.mockResolvedValue(["postgres", "mydb"]);
    mockListSchemas.mockResolvedValue(["public", "information_schema"]);

    const res = await POST(
      makeRequest({
        type: "postgresql",
        config: {
          uri: "postgresql://localhost:5432/postgres",
          username: "pg",
          password: "pass",
        },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.databases).toEqual(["postgres", "mydb"]);
    expect(body.data.schemas).toEqual(["public", "information_schema"]);
  });

  it("returns empty arrays when listing fails", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockListDatabases.mockRejectedValue(new Error("fail"));
    mockListSchemas.mockRejectedValue(new Error("fail"));

    const res = await POST(
      makeRequest({
        type: "postgresql",
        config: {
          uri: "postgresql://localhost:5432/postgres",
          username: "pg",
          password: "pass",
        },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.databases).toEqual([]);
    expect(body.data.schemas).toEqual([]);
  });
});
