import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeParams } from "@/__tests__/helpers/request-helpers";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";
import { ConnectorError, ConnectorErrorType } from "@neoboard/connection";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

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
const mockDecryptJson = vi.fn();
const mockFetchConnectionSchema = vi.fn();

function makeSelectChain(rows: unknown[]) {
  return {
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(rows),
      }),
    }),
  };
}

const mockDb = { select: vi.fn() };

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
vi.mock("@/lib/crypto/crypto", () => ({ decryptJson: mockDecryptJson }));
vi.mock("@/lib/connector/schema-prefetch", () => ({
  fetchConnectionSchema: mockFetchConnectionSchema,
}));
vi.mock("next/server", () => nextResponseMockFactory());
vi.mock("@/lib/auth/errors", () => ({ UnauthorizedError, ForbiddenError }));

const SESSION = {
  userId: "user-1",
  role: "creator",
  canWrite: true,
  tenantId: "t1",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/connections/[id]/schema", () => {
  let GET: (
    req: Request,
    ctx: { params: Promise<{ id: string }> },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import("../route");
    GET = mod.GET;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockRejectedValue(new UnauthorizedError());
    const res = await GET(new Request("http://localhost/x"), makeParams("c1"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 404 when connection not found or not owned", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await GET(new Request("http://localhost/x"), makeParams("c1"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it.each([
    ["", false],
    ["?refresh=1", true],
  ])(
    "reads for the caller's tenant, with url %s refresh=%s (#2514)",
    async (query, refresh) => {
      mockRequireSession.mockResolvedValue(SESSION);
      mockDb.select.mockReturnValue(
        makeSelectChain([
          { id: "c1", userId: "user-1", type: "neo4j", configEncrypted: "enc" },
        ]),
      );
      mockDecryptJson.mockReturnValue({ uri: "bolt://localhost" });
      mockFetchConnectionSchema.mockResolvedValue({});

      await GET(new Request(`http://localhost/x${query}`), makeParams("c1"));

      expect(mockFetchConnectionSchema).toHaveBeenCalledWith(
        "neo4j",
        { uri: "bolt://localhost" },
        {
          tenantId: "t1",
          connectionId: "c1",
          configEncrypted: "enc",
          refresh,
        },
      );
    },
  );

  it.each([
    ["creator", "creator", true],
    ["admin", "admin", true],
    ["reader", "reader", false],
  ])(
    "honours refresh=1 only for a role that manages connections: %s (#2534)",
    async (_who, role, honoured) => {
      mockRequireSession.mockResolvedValue({ ...SESSION, role });
      mockDb.select.mockReturnValue(
        makeSelectChain([
          { id: "c1", userId: "user-1", type: "neo4j", configEncrypted: "enc" },
        ]),
      );
      mockDecryptJson.mockReturnValue({});
      mockFetchConnectionSchema.mockResolvedValue({});
      await GET(new Request("http://localhost/x?refresh=1"), makeParams("c1"));
      expect(mockFetchConnectionSchema).toHaveBeenCalledWith(
        "neo4j",
        {},
        expect.objectContaining({ refresh: honoured }),
      );
    },
  );

  it.each([
    ["an admin, who may use any connection of the tenant", "admin", false],
    ["a creator, who may use their own and shared ones", "creator", true],
  ])("looks the connection up for %s (#2534)", async (_n, role, scoped) => {
    mockRequireSession.mockResolvedValue({ ...SESSION, role });
    let where: unknown;
    mockDb.select.mockReturnValue({
      from: () => ({
        where: (w: unknown) => {
          where = w;
          return { limit: () => Promise.resolve([]) };
        },
      }),
    });
    await GET(new Request("http://localhost/x"), makeParams("c1"));
    const { sql: text, params } = new PgDialect().sqlToQuery(where as SQL);
    expect(params).toContain("t1");
    expect(text.includes('"visibility"')).toBe(scoped);
  });

  it("returns schema on success", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const conn = {
      id: "c1",
      userId: "user-1",
      type: "neo4j",
      configEncrypted: "enc",
    };
    mockDb.select.mockReturnValue(makeSelectChain([conn]));
    mockDecryptJson.mockReturnValue({
      uri: "bolt://localhost",
      username: "neo4j",
      password: "pass",
    });
    const schema = {
      labels: ["Person", "Movie"],
      relationshipTypes: ["ACTED_IN"],
    };
    mockFetchConnectionSchema.mockResolvedValue(schema);

    const res = await GET(new Request("http://localhost/x"), makeParams("c1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(schema);
    expect(body.error).toBeNull();
  });

  it("returns 500 when fetchConnectionSchema throws", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const conn = {
      id: "c1",
      userId: "user-1",
      type: "postgresql",
      configEncrypted: "enc",
    };
    mockDb.select.mockReturnValue(makeSelectChain([conn]));
    mockDecryptJson.mockReturnValue({
      uri: "pg://localhost",
      username: "pg",
      password: "pass",
    });
    mockFetchConnectionSchema.mockRejectedValue(
      new Error("Schema fetch failed"),
    );

    const res = await GET(new Request("http://localhost/x"), makeParams("c1"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).toBe("Schema fetch failed");
  });

  it("answers the connector's own introspection statement at fault 500, not the caller's 422 (#2053)", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValue(
      makeSelectChain([
        { id: "c1", userId: "user-1", type: "fixturedb", configEncrypted: "e" },
      ]),
    );
    mockDecryptJson.mockReturnValue({ uri: "fixturedb://localhost" });
    mockFetchConnectionSchema.mockRejectedValue(
      new ConnectorError("unknown procedure", {
        type: ConnectorErrorType.QUERY,
        transient: false,
        statementFault: true,
      }),
    );

    const res = await GET(new Request("http://localhost/x"), makeParams("c1"));
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("INTERNAL_ERROR");
  });
});
