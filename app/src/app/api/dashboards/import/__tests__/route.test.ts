import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  makeSelectChain,
  makeInsertChain,
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
  insert: vi.fn(),
};

// vi.hoisted: vi.mock factories are hoisted above top-level consts, so the
// mock must be created in the hoisted scope to stay safe if a future refactor
// switches this file to a static import of the route.
const { mockAuditRequest } = vi.hoisted(() => ({ mockAuditRequest: vi.fn() }));

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
}));
vi.mock("@/lib/db", () => ({ db: mockDb }));
// Audit is mocked so route assertions aren't polluted by its own db.insert.
vi.mock("@/lib/audit/audit", () => ({
  auditRequest: mockAuditRequest,
  auditLog: vi.fn(),
}));
vi.mock("next/server", () => nextResponseMockFactory());
vi.mock("@/lib/auth/errors", () => ({ UnauthorizedError, ForbiddenError }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SESSION = {
  userId: "user-1",
  role: "creator",
  canWrite: true,
  tenantId: "tenant-1",
};

const VALID_PAYLOAD = {
  formatVersion: 1,
  exportedAt: "2024-01-01T00:00:00.000Z",
  dashboard: { name: "Imported Dashboard", description: null },
  connections: {
    conn_0: { name: "Neo4j Prod", type: "neo4j" },
  },
  layout: {
    version: 2,
    pages: [
      {
        id: "p1",
        title: "Page 1",
        widgets: [
          {
            id: "w1",
            chartType: "bar",
            connectionId: "conn_0",
            query: "MATCH (n) RETURN n",
          },
        ],
        gridLayout: [{ i: "w1", x: 0, y: 0, w: 6, h: 4 }],
      },
    ],
  },
};

/**
 * Same as VALID_PAYLOAD plus two content-only widgets. dashboard-export.ts
 * writes `connectionId: ""` for markdown/iframe widgets because they never had
 * a connection, so they land in the same empty bucket as import-skipped
 * widgets — and must not be counted as "missing a connection" (#1377).
 */
const PAYLOAD_WITH_CONTENT_ONLY = {
  ...VALID_PAYLOAD,
  layout: {
    version: 2,
    pages: [
      {
        id: "p1",
        title: "Page 1",
        widgets: [
          {
            id: "w1",
            chartType: "bar",
            connectionId: "conn_0",
            query: "MATCH (n) RETURN n",
          },
          { id: "w2", chartType: "markdown", connectionId: "", query: "" },
          { id: "w3", chartType: "iframe", connectionId: "", query: "" },
        ],
        gridLayout: [{ i: "w1", x: 0, y: 0, w: 6, h: 4 }],
      },
    ],
  },
};

const NEODASH_PAYLOAD = {
  title: "NeoDash Dashboard",
  version: "2.4",
  pages: [
    {
      title: "Page 1",
      reports: [
        {
          id: "r1",
          title: "My Table",
          type: "table",
          query: "MATCH (n) RETURN n",
          x: 0,
          y: 0,
          width: 6,
          height: 4,
          settings: {},
          parameters: {},
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/dashboards/import", () => {
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
      makeRequest({ payload: VALID_PAYLOAD, connectionMapping: {} }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for reader role", async () => {
    mockRequireSession.mockResolvedValue({
      ...SESSION,
      role: "reader",
      canWrite: false,
    });
    const res = await POST(
      makeRequest({ payload: VALID_PAYLOAD, connectionMapping: {} }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid payload (missing formatVersion)", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { formatVersion: _fv, ...noVersion } = VALID_PAYLOAD;
    const res = await POST(
      makeRequest({ payload: noVersion, connectionMapping: {} }),
    );
    expect(res.status).toBe(400);
  });

  // The case above fails the *inner* export schema. This one fails the outer
  // request-body schema, a separate branch that reads
  // `parsedBody.error.issues[0]?.message` — `.errors` under zod 3. Reaching for
  // the wrong field throws and turns this 400 into a 500 (#1436).
  it("returns 400 when the request body itself is malformed", async () => {
    mockRequireSession.mockResolvedValue(SESSION);

    // connectionMapping must be an object of string -> string.
    const res = await POST(
      makeRequest({
        payload: VALID_PAYLOAD,
        connectionMapping: "not-an-object",
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(typeof body.error?.message).toBe("string");
    expect(body.error.message.length).toBeGreaterThan(0);
  });

  it("imports a valid NeoBoard export and returns 201 with notes array", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    // Connection ownership check returns 1 allowed connection
    mockDb.select.mockReturnValueOnce(
      makeSelectChain([{ id: "real-conn-id" }]),
    );
    // No existing dashboard with same name
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    const created = {
      id: "new-dash",
      name: "Imported Dashboard",
      userId: "user-1",
      tenantId: "tenant-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockDb.insert.mockReturnValue(makeInsertChain([created]));

    const res = await POST(
      makeRequest({
        payload: VALID_PAYLOAD,
        connectionMapping: { conn_0: "real-conn-id" },
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data).toMatchObject({ id: "new-dash" });
    // Notes envelope is always present (additive contract change)
    expect(Array.isArray(body.data.notes)).toBe(true);
    // Happy-path NeoBoard import has no notes (mapping fully applied)
    expect(body.data.notes).toEqual([]);
  });

  it("records a dashboard.import audit entry (#1234)", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValueOnce(
      makeSelectChain([{ id: "real-conn-id" }]),
    );
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    mockDb.insert.mockReturnValue(
      makeInsertChain([{ id: "new-dash", name: "Imported Dashboard" }]),
    );

    await POST(
      makeRequest({
        payload: VALID_PAYLOAD,
        connectionMapping: { conn_0: "real-conn-id" },
      }),
    );

    expect(mockAuditRequest).toHaveBeenCalledTimes(1);
    const [, entry] = mockAuditRequest.mock.calls[0];
    expect(entry).toMatchObject({
      action: "dashboard.import",
      resourceType: "dashboard",
      resourceId: "new-dash",
      tenantId: SESSION.tenantId,
      userId: SESSION.userId,
      details: { name: "Imported Dashboard", widgetCount: 1 },
    });
  });

  it("writes no audit entry when the payload is rejected (#1234)", async () => {
    mockRequireSession.mockResolvedValue(SESSION);

    const res = await POST(makeRequest({ payload: { nope: true } }));

    expect(res.status).toBe(400);
    expect(mockAuditRequest).not.toHaveBeenCalled();
  });

  it("auto-converts NeoDash format and returns 201 with mapped connection", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    // Connection ownership check passes for the mapped connection
    mockDb.select.mockReturnValueOnce(
      makeSelectChain([{ id: "neo4j-conn-id" }]),
    );
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    const created = {
      id: "nd-dash",
      name: "NeoDash Dashboard",
      userId: "user-1",
      tenantId: "tenant-1",
      layoutJson: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockDb.insert.mockReturnValue(makeInsertChain([created]));

    const res = await POST(
      makeRequest({
        payload: NEODASH_PAYLOAD,
        connectionMapping: { "neodash-default": "neo4j-conn-id" },
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe("nd-dash");
    expect(Array.isArray(body.data.notes)).toBe(true);
  });

  it("NeoDash import with skipped placeholder includes a warning note", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    const created = {
      id: "nd-dash",
      name: "NeoDash Dashboard",
      userId: "user-1",
      tenantId: "tenant-1",
      layoutJson: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockDb.insert.mockReturnValue(makeInsertChain([created]));

    const res = await POST(
      makeRequest({
        payload: NEODASH_PAYLOAD,
        connectionMapping: {},
        skippedConnections: ["neodash-default"],
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.notes.some((n: string) => /skipped/i.test(n))).toBe(true);
  });

  it("NeoBoard import with skipped connection produces an unmapped-widget note", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    // No mapped connections to validate
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    const created = {
      id: "skip-dash",
      name: "Imported Dashboard",
      userId: "user-1",
      tenantId: "tenant-1",
      layoutJson: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockDb.insert.mockReturnValue(makeInsertChain([created]));

    const res = await POST(
      makeRequest({
        payload: VALID_PAYLOAD,
        connectionMapping: {},
        skippedConnections: ["conn_0"],
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(
      body.data.notes.some((n: string) =>
        /imported without a connection/i.test(n),
      ),
    ).toBe(true);
  });

  // ── unassignedWidgetCount (#1377) ──────────────────────────────────────
  // The count is returned, not just described in prose, so the bulk-fix offer
  // in the UI and the note the user reads come from the same number.
  it("returns unassignedWidgetCount matching the number named in the note", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    // No mapped connections to validate — only the name-existence check runs.
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    mockDb.insert.mockReturnValue(makeInsertChain([{ id: "skip-dash" }]));

    const res = await POST(
      makeRequest({
        payload: VALID_PAYLOAD,
        connectionMapping: {},
        skippedConnections: ["conn_0"],
      }),
    );

    const body = await res.json();
    expect(body.data.unassignedWidgetCount).toBe(1);
    const note = body.data.notes.find((n: string) =>
      /imported without a connection/i.test(n),
    );
    expect(note).toContain("1 widget");
  });

  // The false-alarm fix: importing a correctly-mapped dashboard that happens to
  // contain text widgets used to report "2 widgets imported without a
  // connection" because the count had no chart-type filter.
  it("excludes content-only widgets from unassignedWidgetCount and emits no note", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValueOnce(
      makeSelectChain([{ id: "real-conn-id" }]),
    );
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    mockDb.insert.mockReturnValue(makeInsertChain([{ id: "md-dash" }]));

    const res = await POST(
      makeRequest({
        payload: PAYLOAD_WITH_CONTENT_ONLY,
        connectionMapping: { conn_0: "real-conn-id" },
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.unassignedWidgetCount).toBe(0);
    expect(
      body.data.notes.some((n: string) =>
        /imported without a connection/i.test(n),
      ),
    ).toBe(false);
  });

  it("counts only the real widgets when a skip and content-only widgets mix", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    // No mapped connections to validate — only the name-existence check runs.
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    mockDb.insert.mockReturnValue(makeInsertChain([{ id: "mix-dash" }]));

    const res = await POST(
      makeRequest({
        payload: PAYLOAD_WITH_CONTENT_ONLY,
        connectionMapping: {},
        skippedConnections: ["conn_0"],
      }),
    );

    const body = await res.json();
    // w1 was skipped; w2/w3 are markdown+iframe and never wanted a connection.
    expect(body.data.unassignedWidgetCount).toBe(1);
  });

  it("rejects cross-tenant mapping (connection ownership check fails)", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    // Ownership/tenant check returns nothing — mapped id is foreign
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));

    const res = await POST(
      makeRequest({
        payload: VALID_PAYLOAD,
        connectionMapping: { conn_0: "foreign-conn-id" },
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toMatch(/invalid connection mapping/i);
  });

  it("appends (imported) to name when dashboard with same name already exists", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    // Connection ownership check returns 1 allowed connection
    mockDb.select.mockReturnValueOnce(
      makeSelectChain([{ id: "real-conn-id" }]),
    );
    // Existing dashboard found
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ id: "existing" }]));
    const created = {
      id: "new-dash",
      name: "Imported Dashboard (imported)",
      userId: "user-1",
      tenantId: "tenant-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockDb.insert.mockReturnValue(makeInsertChain([created]));

    const res = await POST(
      makeRequest({
        payload: VALID_PAYLOAD,
        connectionMapping: { conn_0: "real-conn-id" },
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.name).toContain("(imported)");
  });
});
