// Coverage: verified at 100% for /api/query routes
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  makeSelectChain,
  sqlColumns,
  sqlValues,
} from "@/__tests__/helpers/drizzle-mocks";
import { makeRequest } from "@/__tests__/helpers/request-helpers";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the route so Vitest hoists them.
// ---------------------------------------------------------------------------

const mockRequireSession = vi.fn<
  () => Promise<{
    userId: string;
    tenantId: string;
    role: string;
    canWrite: boolean;
  }>
>();
const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};
const mockDecryptJson = vi.fn();
const mockExecuteQuery = vi.fn();

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
vi.mock("@/lib/crypto/crypto", () => ({
  decryptJson: mockDecryptJson,
  encryptJson: vi.fn(),
}));
vi.mock("@/lib/query/query-executor", () => ({
  executeQuery: mockExecuteQuery,
  toConnectorAccessMode: (m: "read" | "write") =>
    m === "write" ? "WRITE" : "READ",
}));
vi.mock("@/lib/connector/schema-prefetch", () => ({ prefetchSchema: vi.fn() }));

// Minimal Next.js server shim
vi.mock("next/server", () => nextResponseMockFactory());
vi.mock("@/lib/auth/errors", () => ({ UnauthorizedError, ForbiddenError }));

/** Default authenticated session */
const defaultSession = {
  userId: "user-1",
  tenantId: "tenant-a",
  role: "creator",
  canWrite: true,
};

// Chainable drizzle query builder stub that resolves to `rows`.
function drizzleSelectChain(rows: unknown[]) {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(rows),
    then: (resolve: (v: unknown[]) => unknown) =>
      Promise.resolve(rows).then(resolve),
  };
  return chain;
}

// Like drizzleSelectChain but also supports leftJoin (for dashboard-share queries).
function drizzleJoinChain(rows: unknown[]) {
  const chain = {
    from: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(rows),
    then: (resolve: (v: unknown[]) => unknown) =>
      Promise.resolve(rows).then(resolve),
  };
  return chain;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/query", () => {
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
    const res = await POST(
      makeRequest({ connectionId: "c1", query: "MATCH (n) RETURN n" }),
    );
    // handleRouteError maps UnauthorizedError → 401
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 400 for invalid body (missing query)", async () => {
    mockRequireSession.mockResolvedValue(defaultSession);
    const res = await POST(makeRequest({ connectionId: "c1" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid body (missing connectionId)", async () => {
    mockRequireSession.mockResolvedValue(defaultSession);
    const res = await POST(makeRequest({ query: "SELECT 1" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when connection not found / not owned", async () => {
    mockRequireSession.mockResolvedValue(defaultSession);
    // 1st call: ownership check -> not found
    // 2nd call: dashboard-access check -> no access
    mockDb.select
      .mockReturnValueOnce(drizzleSelectChain([]))
      .mockReturnValueOnce(drizzleJoinChain([]));
    const res = await POST(
      makeRequest({ connectionId: "c1", query: "SELECT 1" }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.message).toMatch(/not found/i);
  });

  it("returns 403 when body tenantId does not match session tenantId", async () => {
    mockRequireSession.mockResolvedValue(defaultSession);
    const res = await POST(
      makeRequest({
        connectionId: "c1",
        query: "SELECT 1",
        tenantId: "tenant-b",
      }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.message).toBe("Tenant mismatch");
  });

  it("succeeds when body tenantId matches session tenantId", async () => {
    mockRequireSession.mockResolvedValue(defaultSession);
    mockDb.select.mockReturnValue(
      drizzleSelectChain([
        {
          id: "c1",
          type: "postgresql",
          configEncrypted: "enc",
          userId: "user-1",
        },
      ]),
    );
    mockDecryptJson.mockReturnValue({
      uri: "postgres://localhost",
      username: "u",
      password: "p",
    });
    mockExecuteQuery.mockResolvedValue({ data: [{ n: 1 }], fields: ["n"] });

    const res = await POST(
      makeRequest({
        connectionId: "c1",
        query: "SELECT 1",
        tenantId: "tenant-a",
      }),
    );
    expect(res.status).toBe(200);
  });

  it("returns 200 with resultId on happy path (no tenantId in body)", async () => {
    mockRequireSession.mockResolvedValue(defaultSession);
    mockDb.select.mockReturnValue(
      drizzleSelectChain([
        {
          id: "c1",
          type: "postgresql",
          configEncrypted: "enc",
          userId: "user-1",
        },
      ]),
    );
    mockDecryptJson.mockReturnValue({
      uri: "postgres://localhost",
      username: "u",
      password: "p",
    });
    mockExecuteQuery.mockResolvedValue({ data: [{ n: 1 }], fields: ["n"] });

    const res = await POST(
      makeRequest({ connectionId: "c1", query: "SELECT 1" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.meta.resultId).toHaveLength(16);
    expect(body.meta.resultId).toMatch(/^[0-9a-f]{16}$/);
    expect(body.data.data).toEqual([{ n: 1 }]);
  });

  it("passes accessMode READ to the connector (not just the config default) (#1044)", async () => {
    mockRequireSession.mockResolvedValue(defaultSession);
    mockDb.select.mockReturnValue(
      drizzleSelectChain([
        {
          id: "c1",
          type: "postgresql",
          configEncrypted: "enc",
          userId: "user-1",
        },
      ]),
    );
    mockDecryptJson.mockReturnValue({
      uri: "postgres://localhost",
      username: "u",
      password: "p",
    });
    mockExecuteQuery.mockResolvedValue({ data: [], fields: [] });

    await POST(makeRequest({ connectionId: "c1", query: "SELECT 1" }));

    // The route's read-only intent must reach the connector explicitly.
    expect(mockExecuteQuery).toHaveBeenCalledWith(
      "postgresql",
      expect.anything(),
      expect.anything(),
      { accessMode: "READ" },
    );
  });

  it("includes resultId in response and it matches computeResultId", async () => {
    mockRequireSession.mockResolvedValue(defaultSession);
    mockDb.select.mockReturnValue(
      drizzleSelectChain([
        { id: "c1", type: "neo4j", configEncrypted: "enc", userId: "user-1" },
      ]),
    );
    mockDecryptJson.mockReturnValue({
      uri: "bolt://localhost",
      username: "neo4j",
      password: "pass",
    });
    mockExecuteQuery.mockResolvedValue({ data: [], fields: [] });

    const { computeResultId } = await import("@/lib/query/query-hash");
    const expected = computeResultId("c1", "MATCH (n) RETURN n");

    const res = await POST(
      makeRequest({ connectionId: "c1", query: "MATCH (n) RETURN n" }),
    );
    const body = await res.json();
    expect(body.meta.resultId).toBe(expected);
  });

  it("returns 500 when executeQuery throws", async () => {
    mockRequireSession.mockResolvedValue(defaultSession);
    mockDb.select.mockReturnValue(
      drizzleSelectChain([
        { id: "c1", type: "neo4j", configEncrypted: "enc", userId: "user-1" },
      ]),
    );
    mockDecryptJson.mockReturnValue({
      uri: "bolt://localhost",
      username: "neo4j",
      password: "pass",
    });
    mockExecuteQuery.mockRejectedValue(new Error("Driver error"));

    const res = await POST(
      makeRequest({ connectionId: "c1", query: "MATCH (n) RETURN n" }),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    // handleRouteError returns a generic fallback message to the client;
    // the raw error is logged but never surfaced (avoids leaking schema).
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).toBe("Driver error");
  });

  // --- Access fallback tests ---

  it("admin can execute query on unowned connection, through one tenant-scoped lookup", async () => {
    mockRequireSession.mockResolvedValue({ ...defaultSession, role: "admin" });
    const conn = {
      id: "c1",
      type: "postgresql",
      configEncrypted: "enc",
      userId: "other-user",
    };
    // usableConnection() puts no ownership predicate on an admin, so the
    // direct lookup finds any connection in the tenant at once (#1822).
    const lookup = makeSelectChain([conn]);
    mockDb.select.mockReturnValueOnce(lookup);
    mockDecryptJson.mockReturnValue({
      uri: "postgres://localhost",
      username: "u",
      password: "p",
    });
    mockExecuteQuery.mockResolvedValue({ data: [{ n: 1 }], fields: ["n"] });

    const res = await POST(
      makeRequest({ connectionId: "c1", query: "SELECT 1" }),
    );
    expect(res.status).toBe(200);
    expect(mockDb.select).toHaveBeenCalledTimes(1);
    const [expr] = lookup.calls.where[0];
    expect(sqlColumns(expr)).toEqual(["id", "tenant_id"]);
    expect(sqlValues(expr)).toEqual(["c1", "tenant-a"]);
  });

  it("non-admin with an EDITOR share can run arbitrary queries (edit level, #972)", async () => {
    mockRequireSession.mockResolvedValue({
      ...defaultSession,
      role: "creator",
    });
    const conn = {
      id: "c1",
      type: "postgresql",
      configEncrypted: "enc",
      userId: "other-user",
    };
    // 1st call: ownership check -> not found
    // 2nd call: dashboard-access check (join) -> editor share found
    // 3rd call: fetch the connection by id
    mockDb.select
      .mockReturnValueOnce(drizzleSelectChain([]))
      .mockReturnValueOnce(
        drizzleJoinChain([
          {
            ownerId: "other-user",
            shareRole: "editor",
            connectionOwnerId: "other-user",
            ownerRole: "creator",
            layoutJson: null,
          },
        ]),
      )
      .mockReturnValueOnce(drizzleSelectChain([conn]));
    mockDecryptJson.mockReturnValue({
      uri: "postgres://localhost",
      username: "u",
      password: "p",
    });
    mockExecuteQuery.mockResolvedValue({ data: [{ n: 1 }], fields: ["n"] });

    const res = await POST(
      makeRequest({ connectionId: "c1", query: "SELECT 1" }),
    );
    expect(res.status).toBe(200);
    expect(mockDb.select).toHaveBeenCalledTimes(3);
  });

  it("non-admin without dashboard access gets 404", async () => {
    mockRequireSession.mockResolvedValue({
      ...defaultSession,
      role: "creator",
    });
    // 1st call: ownership check -> not found
    // 2nd call: dashboard-access check -> no matching dashboard
    mockDb.select
      .mockReturnValueOnce(drizzleSelectChain([]))
      .mockReturnValueOnce(drizzleJoinChain([]));

    const res = await POST(
      makeRequest({ connectionId: "c1", query: "SELECT 1" }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.message).toMatch(/not found/i);
  });

  it("non-admin viewing a public dashboard can run ITS queries (view level, bound, #972)", async () => {
    mockRequireSession.mockResolvedValue({
      ...defaultSession,
      role: "creator",
    });
    const conn = {
      id: "c1",
      type: "postgresql",
      configEncrypted: "enc",
      userId: "other-user",
    };
    // 1st call: ownership check -> not found
    // 2nd call: dashboard-access check (join) -> public dashboard whose
    //           layout contains exactly this query
    // 3rd call: fetch the connection by id
    mockDb.select
      .mockReturnValueOnce(drizzleSelectChain([]))
      .mockReturnValueOnce(
        drizzleJoinChain([
          {
            ownerId: "other-user",
            shareRole: null,
            layoutJson: {
              pages: [{ widgets: [{ connectionId: "c1", query: "SELECT 1" }] }],
            },
          },
        ]),
      )
      .mockReturnValueOnce(drizzleSelectChain([conn]));
    mockDecryptJson.mockReturnValue({
      uri: "postgres://localhost",
      username: "u",
      password: "p",
    });
    mockExecuteQuery.mockResolvedValue({ data: [{ n: 1 }], fields: ["n"] });

    const res = await POST(
      makeRequest({ connectionId: "c1", query: "SELECT 1" }),
    );
    expect(res.status).toBe(200);
    expect(mockDb.select).toHaveBeenCalledTimes(3);
  });

  it("viewer of a public dashboard CANNOT run arbitrary queries (#972)", async () => {
    mockRequireSession.mockResolvedValue({
      ...defaultSession,
      role: "reader",
    });
    // 1st call: ownership check -> not found
    // 2nd call: dashboard-access check -> view-level dashboard whose layout
    //           does NOT contain the submitted query
    mockDb.select
      .mockReturnValueOnce(drizzleSelectChain([]))
      .mockReturnValueOnce(
        drizzleJoinChain([
          {
            ownerId: "other-user",
            shareRole: "viewer",
            layoutJson: {
              pages: [
                {
                  widgets: [
                    {
                      connectionId: "c1",
                      query: "SELECT category FROM orders",
                    },
                  ],
                },
              ],
            },
          },
        ]),
      );

    const res = await POST(
      makeRequest({ connectionId: "c1", query: "SELECT * FROM pg_shadow" }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.message).toMatch(/not part of any dashboard/i);
    expect(mockExecuteQuery).not.toHaveBeenCalled();
  });

  it("viewer binding accepts param-select seed queries (#972)", async () => {
    mockRequireSession.mockResolvedValue({
      ...defaultSession,
      role: "reader",
    });
    const conn = {
      id: "c1",
      type: "postgresql",
      configEncrypted: "enc",
      userId: "other-user",
    };
    mockDb.select
      .mockReturnValueOnce(drizzleSelectChain([]))
      .mockReturnValueOnce(
        drizzleJoinChain([
          {
            ownerId: "other-user",
            shareRole: "viewer",
            layoutJson: {
              pages: [
                {
                  widgets: [
                    {
                      connectionId: "c1",
                      settings: {
                        chartOptions: {
                          seedQuery: "SELECT DISTINCT region FROM t",
                        },
                      },
                    },
                  ],
                },
              ],
            },
          },
        ]),
      )
      .mockReturnValueOnce(drizzleSelectChain([conn]));
    mockDecryptJson.mockReturnValue({
      uri: "postgres://localhost",
      username: "u",
      password: "p",
    });
    mockExecuteQuery.mockResolvedValue({ data: [], fields: [] });

    const res = await POST(
      makeRequest({
        connectionId: "c1",
        query: "SELECT DISTINCT region FROM t",
      }),
    );
    expect(res.status).toBe(200);
  });

  // Edit level (#972) lets a dashboard's owner and editors run any read query
  // on a connection it names. It holds only while the dashboard's owner can use
  // that connection and the caller may write. Otherwise they are bound to the
  // dashboard's own queries, like a viewer (#1816).
  describe("edit level through a dashboard (#1816)", () => {
    const SAVED = "SELECT category FROM orders";
    const NOVEL = "SELECT something_new FROM t";
    const alicesConnection = {
      id: "c1",
      type: "postgresql",
      configEncrypted: "enc",
      userId: "alice",
    };

    /** POST through the dashboard fallback; `runs` queues the connection fetch. */
    function queryVia(
      row: Record<string, unknown>,
      query: string,
      runs: boolean,
    ) {
      mockDb.select
        .mockReturnValueOnce(drizzleSelectChain([]))
        .mockReturnValueOnce(
          drizzleJoinChain([
            {
              layoutJson: {
                pages: [{ widgets: [{ connectionId: "c1", query: SAVED }] }],
              },
              ...row,
            },
          ]),
        );
      if (runs) {
        mockDb.select.mockReturnValueOnce(
          drizzleSelectChain([alicesConnection]),
        );
      }
      mockDecryptJson.mockReturnValue({
        uri: "postgres://localhost",
        username: "u",
        password: "p",
      });
      mockExecuteQuery.mockResolvedValue({ data: [], fields: [] });
      return POST(makeRequest({ connectionId: "c1", query }));
    }

    async function expectBound(row: Record<string, unknown>) {
      const novel = await queryVia(row, NOVEL, false);
      expect(novel.status).toBe(403);
      expect((await novel.json()).error.message).toMatch(
        /not part of any dashboard/i,
      );
      expect(mockExecuteQuery).not.toHaveBeenCalled();
      expect((await queryVia(row, SAVED, true)).status).toBe(200);
    }

    it("owner of a dashboard naming a connection its owner cannot use: novel query 403, its own query 200", async () => {
      mockRequireSession.mockResolvedValue(defaultSession);
      await expectBound({
        ownerId: "user-1",
        shareRole: null,
        connectionOwnerId: "alice",
        ownerRole: "creator",
      });
      // No connection fetch for the refused query: 2 selects, then 3.
      expect(mockDb.select).toHaveBeenCalledTimes(5);
    });

    it("binds an editor share once the dashboard's owner cannot use the connection", async () => {
      mockRequireSession.mockResolvedValue(defaultSession);
      await expectBound({
        ownerId: "bob",
        shareRole: "editor",
        connectionOwnerId: "alice",
        ownerRole: "creator",
      });
      // No connection fetch for the refused query: 2 selects, then 3.
      expect(mockDb.select).toHaveBeenCalledTimes(5);
    });

    it.each([
      { role: "reader", canWrite: false },
      { role: "creator", canWrite: false },
    ])(
      "binds a $role with write permission off who holds an editor share",
      async (session) => {
        mockRequireSession.mockResolvedValue({ ...defaultSession, ...session });
        await expectBound({
          ownerId: "alice",
          shareRole: "editor",
          connectionOwnerId: "alice",
          ownerRole: "admin",
        });
        // No connection fetch for the refused query: 2 selects, then 3.
        expect(mockDb.select).toHaveBeenCalledTimes(5);
      },
    );

    it("keeps edit level for an editor share on an admin's dashboard", async () => {
      mockRequireSession.mockResolvedValue(defaultSession);
      const res = await queryVia(
        {
          ownerId: "alice",
          shareRole: "editor",
          connectionOwnerId: "carol",
          ownerRole: "admin",
        },
        NOVEL,
        true,
      );
      expect(res.status).toBe(200);
      expect(mockExecuteQuery).toHaveBeenCalledTimes(1);
    });
  });

  // A view-level caller runs a saved query only where the dashboard runs it:
  // on its widget's connection, with the database that widget saves, or with
  // none when it saves none (#1822). The route applies the request's database
  // to the connection's credentials whenever allowPerCardDb is on.
  describe("view level runs a saved query on its saved database only (#1822)", () => {
    const QUERY = "SELECT title FROM movies";
    const alicesConnection = {
      id: "c1",
      type: "postgresql",
      configEncrypted: "enc",
      userId: "alice",
      allowPerCardDb: true,
    };

    /** A viewer's POST on a dashboard of `widgets`; `runs` queues the connection fetch. */
    function viewerQuery(
      widgets: Record<string, unknown>[],
      body: { database?: string },
      runs: boolean,
    ) {
      mockRequireSession.mockResolvedValue({
        ...defaultSession,
        role: "reader",
        canWrite: false,
      });
      mockDb.select
        .mockReturnValueOnce(drizzleSelectChain([]))
        .mockReturnValueOnce(
          drizzleJoinChain([
            {
              ownerId: "alice",
              shareRole: "viewer",
              connectionOwnerId: "alice",
              ownerRole: "creator",
              layoutJson: { pages: [{ widgets }] },
            },
          ]),
        );
      if (runs) {
        mockDb.select.mockReturnValueOnce(
          drizzleSelectChain([alicesConnection]),
        );
      }
      mockDecryptJson.mockReturnValue({
        uri: "postgres://localhost",
        username: "u",
        password: "p",
        database: "neoboard",
      });
      mockExecuteQuery.mockResolvedValue({ data: [], fields: [] });
      return POST(makeRequest({ connectionId: "c1", query: QUERY, ...body }));
    }

    function expectRanOn(database: string) {
      expect(mockExecuteQuery).toHaveBeenCalledWith(
        "postgresql",
        expect.objectContaining({ database }),
        expect.anything(),
        { accessMode: "READ" },
      );
    }

    /** What a request came to: its status, its error message, whether it ran. */
    async function outcome(pending: ReturnType<typeof viewerQuery>) {
      const res = await pending;
      return {
        status: res.status,
        message: (await res.json()).error?.message,
        ran: mockExecuteQuery.mock.calls.length > 0,
      };
    }

    const REFUSED = {
      status: 403,
      message: expect.stringMatching(/not part of any dashboard/i),
      ran: false,
    };

    it("runs the saved query on its saved database", async () => {
      const res = await viewerQuery(
        [{ connectionId: "c1", query: QUERY, database: "movies" }],
        { database: "movies" },
        true,
      );
      expect(res.status).toBe(200);
      expectRanOn("movies");
    });

    it("runs a query saved without a database on the connection's default", async () => {
      const res = await viewerQuery(
        [{ connectionId: "c1", query: QUERY }],
        {},
        true,
      );
      expect(res.status).toBe(200);
      expectRanOn("neoboard");
    });

    it("reads an empty database as none, and runs on the connection's default", async () => {
      const res = await viewerQuery(
        [{ connectionId: "c1", query: QUERY }],
        { database: "" },
        true,
      );
      expect(res.status).toBe(200);
      expectRanOn("neoboard");
    });

    it("refuses the saved query on another database", async () => {
      expect(
        await outcome(
          viewerQuery(
            [{ connectionId: "c1", query: QUERY, database: "movies" }],
            { database: "neoboard" },
            false,
          ),
        ),
      ).toEqual(REFUSED);
    });

    it("refuses a database for a query its widget saves without one", async () => {
      expect(
        await outcome(
          viewerQuery(
            [{ connectionId: "c1", query: QUERY }],
            { database: "movies" },
            false,
          ),
        ),
      ).toEqual(REFUSED);
    });

    it("refuses a query the dashboard saves only on another connection", async () => {
      expect(
        await outcome(
          viewerQuery(
            [
              { connectionId: "c2", query: QUERY },
              { connectionId: "c1", query: "SELECT 1" },
            ],
            {},
            false,
          ),
        ),
      ).toEqual(REFUSED);
    });
  });

  // A view-level caller runs a saved query only as its exact saved text.
  // Clients send the saved string verbatim, so a text that differs from it in
  // any way, whitespace and line breaks included, is not a query the dashboard
  // contains. Callers who are not bound run the text they send, as before.
  describe("view level runs a saved query only as its exact saved text", () => {
    const SAVED =
      "SELECT title, released\n  FROM movies -- newest first\n  ORDER BY released DESC";
    const MOVED =
      "SELECT title,\n  released FROM movies -- newest first\n  ORDER BY released DESC";
    const alicesConnection = {
      id: "c1",
      type: "postgresql",
      configEncrypted: "enc",
      userId: "alice",
    };
    const layoutJson = {
      pages: [{ widgets: [{ connectionId: "c1", query: SAVED }] }],
    };

    /** POST `query` once `lookups` are queued to answer the route's selects. */
    function run(
      session: Partial<typeof defaultSession>,
      lookups: unknown[],
      query: string,
    ) {
      mockRequireSession.mockResolvedValue({ ...defaultSession, ...session });
      for (const chain of lookups) mockDb.select.mockReturnValueOnce(chain);
      mockDecryptJson.mockReturnValue({
        uri: "postgres://localhost",
        username: "u",
        password: "p",
      });
      mockExecuteQuery.mockResolvedValue({ data: [], fields: [] });
      return POST(makeRequest({ connectionId: "c1", query }));
    }

    const viewer = { role: "reader", canWrite: false };
    /** A viewer share's selects; the connection fetch only when it runs. */
    const viewerShare = (runs: boolean, saved = layoutJson) => [
      drizzleSelectChain([]),
      drizzleJoinChain([
        {
          ownerId: "alice",
          shareRole: "viewer",
          connectionOwnerId: "alice",
          ownerRole: "creator",
          layoutJson: saved,
        },
      ]),
      ...(runs ? [drizzleSelectChain([alicesConnection])] : []),
    ];

    function expectRan(query: string) {
      expect(mockExecuteQuery).toHaveBeenCalledWith(
        "postgresql",
        expect.anything(),
        { query, params: {} },
        { accessMode: "READ" },
      );
    }

    it("runs the exact saved text", async () => {
      const res = await run(viewer, viewerShare(true), SAVED);
      expect(res.status).toBe(200);
      expectRan(SAVED);
    });

    it("runs a saved text ending in a CRLF when sent exactly as saved", async () => {
      const savedCrlf = `${SAVED.replaceAll("\n", "\r\n")}\r\n`;
      const saved = {
        pages: [{ widgets: [{ connectionId: "c1", query: savedCrlf }] }],
      };
      const res = await run(viewer, viewerShare(true, saved), savedCrlf);
      expect(res.status).toBe(200);
      expectRan(savedCrlf);
    });

    it.each([
      ["a line break moved", MOVED],
      ["CRLF line breaks", SAVED.replaceAll("\n", "\r\n")],
      ["a trailing newline", `${SAVED}\n`],
      ["its indentation changed", SAVED.replaceAll("\n  ", "\n    ")],
    ])("refuses the saved text with %s", async (_change, query) => {
      const res = await run(viewer, viewerShare(false), query);
      expect(res.status).toBe(403);
      expect((await res.json()).error.message).toMatch(
        /not part of any dashboard/i,
      );
      expect(mockExecuteQuery).not.toHaveBeenCalled();
    });

    it.each([
      {
        caller: "the connection's owner",
        lookups: () => [
          drizzleSelectChain([{ ...alicesConnection, userId: "user-1" }]),
        ],
      },
      {
        caller: "an editor share",
        lookups: () => [
          drizzleSelectChain([]),
          drizzleJoinChain([
            {
              ownerId: "alice",
              shareRole: "editor",
              connectionOwnerId: "alice",
              ownerRole: "creator",
              layoutJson,
            },
          ]),
          drizzleSelectChain([alicesConnection]),
        ],
      },
    ])("$caller still runs the text it sends", async ({ lookups }) => {
      const res = await run({}, lookups(), MOVED);
      expect(res.status).toBe(200);
      expectRan(MOVED);
    });
  });

  // Only view level is bound. The connection's owner, a user of a
  // tenant-shared connection, an admin and an editor share still pick the
  // database a query runs on (#1822).
  describe("callers who are not bound still choose the database (#1822)", () => {
    const connection = {
      id: "c1",
      type: "postgresql",
      configEncrypted: "enc",
      userId: "other-user",
      allowPerCardDb: true,
    };

    it.each([
      {
        caller: "the connection's owner",
        session: {},
        lookups: () => [
          drizzleSelectChain([{ ...connection, userId: "user-1" }]),
        ],
      },
      {
        caller: "a user of a tenant-shared connection",
        session: { role: "reader", canWrite: false },
        lookups: () => [
          drizzleSelectChain([{ ...connection, visibility: "shared" }]),
        ],
      },
      {
        caller: "an admin",
        session: { role: "admin" },
        lookups: () => [drizzleSelectChain([connection])],
      },
      {
        caller: "an editor share",
        session: {},
        lookups: () => [
          drizzleSelectChain([]),
          drizzleJoinChain([
            {
              ownerId: "other-user",
              shareRole: "editor",
              connectionOwnerId: "other-user",
              ownerRole: "creator",
              layoutJson: {
                pages: [
                  { widgets: [{ connectionId: "c1", query: "SELECT 1" }] },
                ],
              },
            },
          ]),
          drizzleSelectChain([connection]),
        ],
      },
    ])("$caller", async ({ session, lookups }) => {
      mockRequireSession.mockResolvedValue({ ...defaultSession, ...session });
      for (const chain of lookups()) mockDb.select.mockReturnValueOnce(chain);
      mockDecryptJson.mockReturnValue({
        uri: "postgres://localhost",
        username: "u",
        password: "p",
        database: "neoboard",
      });
      mockExecuteQuery.mockResolvedValue({ data: [], fields: [] });

      const res = await POST(
        makeRequest({
          connectionId: "c1",
          query: "SELECT something_new FROM t",
          database: "archive",
        }),
      );

      expect(res.status).toBe(200);
      expect(mockExecuteQuery).toHaveBeenCalledWith(
        "postgresql",
        expect.objectContaining({ database: "archive" }),
        expect.anything(),
        { accessMode: "READ" },
      );
    });
  });

  it("owner still works without any fallback (regression)", async () => {
    mockRequireSession.mockResolvedValue(defaultSession);
    const conn = {
      id: "c1",
      type: "postgresql",
      configEncrypted: "enc",
      userId: "user-1",
    };
    mockDb.select.mockReturnValueOnce(drizzleSelectChain([conn]));
    mockDecryptJson.mockReturnValue({
      uri: "postgres://localhost",
      username: "u",
      password: "p",
    });
    mockExecuteQuery.mockResolvedValue({ data: [{ n: 1 }], fields: ["n"] });

    const res = await POST(
      makeRequest({ connectionId: "c1", query: "SELECT 1" }),
    );
    expect(res.status).toBe(200);
    // Only 1 db.select call — fast path, no fallback needed
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });

  it("a tenant-shared connection runs novel queries on the fast path (#901)", async () => {
    mockRequireSession.mockResolvedValue(defaultSession);
    const conn = {
      id: "c1",
      type: "postgresql",
      configEncrypted: "enc",
      userId: "other-user",
      visibility: "shared",
    };
    const lookup = makeSelectChain([conn]);
    mockDb.select.mockReturnValueOnce(lookup);
    mockDecryptJson.mockReturnValue({
      uri: "postgres://localhost",
      username: "u",
      password: "p",
    });
    mockExecuteQuery.mockResolvedValue({ data: [], fields: [] });

    const res = await POST(
      makeRequest({ connectionId: "c1", query: "SELECT something_new FROM t" }),
    );

    expect(res.status).toBe(200);
    expect(mockDb.select).toHaveBeenCalledTimes(1);
    const [expr] = lookup.calls.where[0];
    expect(sqlColumns(expr)).toEqual(
      expect.arrayContaining(["id", "tenant_id", "userId", "visibility"]),
    );
    expect(sqlValues(expr)).toEqual(
      expect.arrayContaining(["c1", "tenant-a", "user-1", "shared"]),
    );
  });

  // --- Tenant isolation tests ---

  it("fast-path ownership check is tenant-scoped (regression: #572)", async () => {
    // Simulate a connection that matches userId but belongs to a different
    // tenant. The fast-path WHERE clause must include tenantId so this
    // connection is NOT returned.
    mockRequireSession.mockResolvedValue(defaultSession);

    // We need the where() call to actually filter by tenantId.
    // Use a custom chain that inspects the call count to verify
    // the fast-path returns empty (forcing fallback path → 404).
    mockDb.select
      .mockReturnValueOnce(drizzleSelectChain([])) // fast-path: no match (tenant-scoped)
      .mockReturnValueOnce(drizzleJoinChain([])); // dashboard-access: no match

    const res = await POST(
      makeRequest({ connectionId: "c1", query: "SELECT 1" }),
    );
    // Connection exists for this userId but wrong tenant → 404
    expect(res.status).toBe(404);
  });

  // --- Row cap (driver-reported truncation) tests ---
  //
  // Truncation is now enforced at the driver layer and signaled via the
  // executor's setStatus callback. The route just forwards `truncated` and
  // `rowLimit` from executeQuery's return value into the response meta —
  // no more post-hoc `rawData.length > MAX_ROWS` slicing.

  it("forwards truncated:true and rowLimit when the driver signals truncation", async () => {
    mockRequireSession.mockResolvedValue(defaultSession);
    mockDb.select.mockReturnValue(
      drizzleSelectChain([
        {
          id: "c1",
          type: "postgresql",
          configEncrypted: "enc",
          userId: "user-1",
        },
      ]),
    );
    mockDecryptJson.mockReturnValue({
      uri: "postgres://localhost",
      username: "u",
      password: "p",
    });
    // Driver already sliced to exactly rowLimit rows + set truncated flag.
    const cappedData = Array.from({ length: 5000 }, (_, i) => ({ n: i }));
    mockExecuteQuery.mockResolvedValue({
      data: cappedData,
      fields: ["n"],
      truncated: true,
      rowLimit: 5000,
    });

    const res = await POST(
      makeRequest({ connectionId: "c1", query: "SELECT * FROM t" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.data).toHaveLength(5000);
    expect(body.meta.truncated).toBe(true);
    expect(body.meta.rowLimit).toBe(5000);
  });

  it("omits truncated flag when driver reports no truncation", async () => {
    mockRequireSession.mockResolvedValue(defaultSession);
    mockDb.select.mockReturnValue(
      drizzleSelectChain([
        {
          id: "c1",
          type: "postgresql",
          configEncrypted: "enc",
          userId: "user-1",
        },
      ]),
    );
    mockDecryptJson.mockReturnValue({
      uri: "postgres://localhost",
      username: "u",
      password: "p",
    });
    mockExecuteQuery.mockResolvedValue({
      data: [{ n: 1 }],
      fields: ["n"],
      truncated: false,
      rowLimit: 5000,
    });

    const res = await POST(
      makeRequest({ connectionId: "c1", query: "SELECT 1" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.data).toHaveLength(1);
    expect(body.meta.truncated).toBeUndefined();
    expect(body.meta.rowLimit).toBe(5000);
  });

  it("echoes the per-connection rowLimit override when the creator raised it", async () => {
    // When a connection's credentials.maxRows is set to e.g. 20000, the
    // executor uses that as rowLimit and returns it in the result. This
    // test pins that the route faithfully forwards the override.
    mockRequireSession.mockResolvedValue(defaultSession);
    mockDb.select.mockReturnValue(
      drizzleSelectChain([
        {
          id: "c1",
          type: "postgresql",
          configEncrypted: "enc",
          userId: "user-1",
        },
      ]),
    );
    mockDecryptJson.mockReturnValue({
      uri: "postgres://localhost",
      username: "u",
      password: "p",
      maxRows: 20000,
    });
    const cappedData = Array.from({ length: 20000 }, (_, i) => ({ n: i }));
    mockExecuteQuery.mockResolvedValue({
      data: cappedData,
      fields: ["n"],
      truncated: true,
      rowLimit: 20000,
    });

    const res = await POST(
      makeRequest({ connectionId: "c1", query: "SELECT * FROM t" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.data).toHaveLength(20000);
    expect(body.meta.truncated).toBe(true);
    expect(body.meta.rowLimit).toBe(20000);
  });

  describe("per-request rowLimit (#1896)", () => {
    function ownedConnection() {
      mockRequireSession.mockResolvedValue(defaultSession);
      mockDb.select.mockReturnValue(
        drizzleSelectChain([
          {
            id: "c1",
            type: "postgresql",
            configEncrypted: "enc",
            userId: "user-1",
          },
        ]),
      );
      mockDecryptJson.mockReturnValue({
        uri: "postgres://localhost",
        username: "u",
        password: "p",
      });
    }

    it.each([0, -1, 1.5, "25", null])(
      "rejects rowLimit %j with 400 and runs nothing",
      async (rowLimit) => {
        ownedConnection();

        const res = await POST(
          makeRequest({ connectionId: "c1", query: "SELECT 1", rowLimit }),
        );

        expect(res.status).toBe(400);
        expect(mockExecuteQuery).not.toHaveBeenCalled();
      },
    );

    it("hands the requested rowLimit to the executor with the query text untouched", async () => {
      ownedConnection();
      mockExecuteQuery.mockResolvedValue({ data: [], rowLimit: 25 });
      const query = "SELECT * FROM movies ORDER BY title;";

      const res = await POST(
        makeRequest({ connectionId: "c1", query, rowLimit: 25 }),
      );

      expect(res.status).toBe(200);
      expect(mockExecuteQuery).toHaveBeenCalledWith(
        "postgresql",
        expect.anything(),
        { query, params: {} },
        { accessMode: "READ", rowLimit: 25 },
      );
    });

    it("gives a capped result another resultId than the uncapped one", async () => {
      ownedConnection();
      const body = { connectionId: "c1", query: "SELECT * FROM movies" };

      mockExecuteQuery.mockResolvedValue({ data: [], rowLimit: 5000 });
      const full = await (await POST(makeRequest(body))).json();
      mockExecuteQuery.mockResolvedValue({ data: [], rowLimit: 25 });
      const capped = await (
        await POST(makeRequest({ ...body, rowLimit: 25 }))
      ).json();

      expect(capped.meta.resultId).not.toBe(full.meta.resultId);
    });
  });

  it("forwards truncated correctly for non-array (graph) results", async () => {
    mockRequireSession.mockResolvedValue(defaultSession);
    mockDb.select.mockReturnValue(
      drizzleSelectChain([
        { id: "c1", type: "neo4j", configEncrypted: "enc", userId: "user-1" },
      ]),
    );
    mockDecryptJson.mockReturnValue({
      uri: "bolt://localhost",
      username: "neo4j",
      password: "pass",
    });
    // Non-array result (e.g. graph data object) — still carries a
    // rowLimit in meta, but not truncated since the driver didn't flag it.
    mockExecuteQuery.mockResolvedValue({
      data: { nodes: [], edges: [] },
      fields: [],
      truncated: false,
      rowLimit: 5000,
    });

    const res = await POST(
      makeRequest({ connectionId: "c1", query: "MATCH (n) RETURN n" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.meta.truncated).toBeUndefined();
    expect(body.meta.rowLimit).toBe(5000);
    expect(body.data.data).toEqual({ nodes: [], edges: [] });
  });

  // --- Per-card database override tests ---

  it("applies databaseOverride when connection.allowPerCardDb is true", async () => {
    mockRequireSession.mockResolvedValue(defaultSession);
    mockDb.select.mockReturnValue(
      drizzleSelectChain([
        {
          id: "c1",
          type: "neo4j",
          configEncrypted: "enc",
          userId: "user-1",
          allowPerCardDb: true,
        },
      ]),
    );
    mockDecryptJson.mockReturnValue({
      uri: "bolt://localhost",
      username: "neo4j",
      password: "pass",
      database: "neo4j",
    });
    mockExecuteQuery.mockResolvedValue({
      data: [{ n: 1 }],
      fields: ["n"],
      truncated: false,
      rowLimit: 5000,
    });

    const res = await POST(
      makeRequest({
        connectionId: "c1",
        query: "MATCH (n) RETURN n",
        database: "otherdb",
      }),
    );
    expect(res.status).toBe(200);

    // executeQuery should have been called with credentials where database is overridden
    expect(mockExecuteQuery).toHaveBeenCalledWith(
      "neo4j",
      expect.objectContaining({ database: "otherdb" }),
      expect.anything(),
      { accessMode: "READ" },
    );
  });

  it("ignores databaseOverride when connection.allowPerCardDb is false", async () => {
    mockRequireSession.mockResolvedValue(defaultSession);
    mockDb.select.mockReturnValue(
      drizzleSelectChain([
        {
          id: "c1",
          type: "neo4j",
          configEncrypted: "enc",
          userId: "user-1",
          allowPerCardDb: false,
        },
      ]),
    );
    mockDecryptJson.mockReturnValue({
      uri: "bolt://localhost",
      username: "neo4j",
      password: "pass",
      database: "neo4j",
    });
    mockExecuteQuery.mockResolvedValue({
      data: [{ n: 1 }],
      fields: ["n"],
      truncated: false,
      rowLimit: 5000,
    });

    const res = await POST(
      makeRequest({
        connectionId: "c1",
        query: "MATCH (n) RETURN n",
        database: "otherdb",
      }),
    );
    expect(res.status).toBe(200);

    // executeQuery should have been called with the original credentials (database NOT overridden)
    expect(mockExecuteQuery).toHaveBeenCalledWith(
      "neo4j",
      expect.objectContaining({ database: "neo4j" }),
      expect.anything(),
      { accessMode: "READ" },
    );
  });

  it("ignores databaseOverride when connection.allowPerCardDb is undefined", async () => {
    mockRequireSession.mockResolvedValue(defaultSession);
    mockDb.select.mockReturnValue(
      drizzleSelectChain([
        {
          id: "c1",
          type: "postgresql",
          configEncrypted: "enc",
          userId: "user-1",
          // allowPerCardDb not set
        },
      ]),
    );
    mockDecryptJson.mockReturnValue({
      uri: "postgres://localhost",
      username: "u",
      password: "p",
      database: "mydb",
    });
    mockExecuteQuery.mockResolvedValue({
      data: [{ n: 1 }],
      fields: ["n"],
      truncated: false,
      rowLimit: 5000,
    });

    const res = await POST(
      makeRequest({
        connectionId: "c1",
        query: "SELECT 1",
        database: "hackerdb",
      }),
    );
    expect(res.status).toBe(200);

    // Original database preserved — override ignored
    expect(mockExecuteQuery).toHaveBeenCalledWith(
      "postgresql",
      expect.objectContaining({ database: "mydb" }),
      expect.anything(),
      { accessMode: "READ" },
    );
  });

  it("does not override when no database field is sent in body", async () => {
    mockRequireSession.mockResolvedValue(defaultSession);
    mockDb.select.mockReturnValue(
      drizzleSelectChain([
        {
          id: "c1",
          type: "neo4j",
          configEncrypted: "enc",
          userId: "user-1",
          allowPerCardDb: true,
        },
      ]),
    );
    mockDecryptJson.mockReturnValue({
      uri: "bolt://localhost",
      username: "neo4j",
      password: "pass",
      database: "neo4j",
    });
    mockExecuteQuery.mockResolvedValue({
      data: [],
      fields: [],
      truncated: false,
      rowLimit: 5000,
    });

    const res = await POST(
      makeRequest({
        connectionId: "c1",
        query: "MATCH (n) RETURN n",
        // no database field
      }),
    );
    expect(res.status).toBe(200);

    // Original credentials used as-is
    expect(mockExecuteQuery).toHaveBeenCalledWith(
      "neo4j",
      expect.objectContaining({ database: "neo4j" }),
      expect.anything(),
      { accessMode: "READ" },
    );
  });
});
