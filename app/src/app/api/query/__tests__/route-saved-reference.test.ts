// A saved widget's query travels as a reference, not as text (#2477): the
// request body stays small enough for a proxy that caps bodies at a few KB.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeRequest } from "@/__tests__/helpers/request-helpers";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";

const mockRequireSession = vi.fn();
const mockDb = { select: vi.fn() };
const mockDecryptJson = vi.fn();
const mockExecuteQuery = vi.fn();
const mockAccess = vi.fn();

class UnauthorizedError extends Error {}
class ForbiddenError extends Error {}

vi.mock("@/lib/auth/session", () => ({ requireSession: mockRequireSession }));
vi.mock("@/lib/dashboard/access", () => ({
  resolveDashboardAccess: (opts: unknown) => mockAccess(opts),
}));
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
vi.mock("next/server", () => nextResponseMockFactory());
vi.mock("@/lib/auth/errors", () => ({ UnauthorizedError, ForbiddenError }));

const session = {
  userId: "viewer-1",
  tenantId: "tenant-a",
  role: "reader",
  canWrite: false,
};

const BIG = "/* " + "x".repeat(12_000) + " */ MATCH (n) RETURN n";

const widgets = [
  {
    id: "w-chart",
    chartType: "table",
    connectionId: "c1",
    database: "sales",
    query: BIG,
    params: {},
    settings: {},
  },
  {
    id: "w-param",
    chartType: "parameter-select",
    connectionId: "c1",
    query: "",
    settings: { chartOptions: { seedQuery: "SEED chart" } },
  },
  {
    id: "w-form",
    chartType: "form",
    connectionId: "c1",
    database: "sales",
    query: "CREATE (n) // the form's own write",
    settings: {
      formFields: [
        { id: "f1", seedQuery: "SEED one" },
        { id: "f2", seedQuery: "SEED two" },
      ],
    },
  },
  { id: "w-md", chartType: "markdown", connectionId: "", query: "" },
];

const connection = {
  id: "c1",
  type: "neo4j",
  configEncrypted: "enc",
  userId: "someone-else",
  allowPerCardDb: true,
};

function chain(rows: unknown[]) {
  const c = {
    from: () => c,
    where: () => c,
    limit: () => Promise.resolve(rows),
  };
  return c;
}

const ref = (over: Record<string, unknown> = {}) => ({
  dashboardId: "d1",
  widgetId: "w-chart",
  ...over,
});

describe("POST /api/query with a saved-query reference (#2477)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let POST: (req: Request) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRequireSession.mockResolvedValue(session);
    mockAccess.mockResolvedValue({
      dashboard: { layoutJson: { version: 2, pages: [{ widgets }] } },
    });
    mockDb.select.mockReturnValue(chain([connection]));
    mockDecryptJson.mockReturnValue({ uri: "bolt://x", database: "neo4j" });
    mockExecuteQuery.mockResolvedValue({ data: [{ n: 1 }] });
    POST = (await import("../route")).POST;
  });

  const post = (body: Record<string, unknown>) =>
    POST(makeRequest({ connectionId: "c1", ...body }));

  it("runs the saved query on the saved connection and database, read-only", async () => {
    const res = await post({ ref: ref(), params: { param_a: 1 } });
    expect(res.status).toBe(200);
    expect(mockAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        dashboardId: "d1",
        tenantId: "tenant-a",
        required: "viewer",
      }),
    );
    const [, creds, q, opts] = mockExecuteQuery.mock.calls[0];
    expect(creds.database).toBe("sales");
    expect(q).toEqual({ query: BIG, params: { param_a: 1 } });
    expect(opts.accessMode).toBe("READ");
  });

  it.each([
    [
      "a parameter selector's seed",
      { widgetId: "w-param", seed: {} },
      "SEED chart",
    ],
    [
      "a form field's seed, by field id",
      { widgetId: "w-form", seed: { fieldId: "f2" } },
      "SEED two",
    ],
  ])("resolves %s", async (_n, over, expected) => {
    const res = await post({ ref: ref(over) });
    expect(res.status).toBe(200);
    expect(mockExecuteQuery.mock.calls[0][2].query).toBe(expected);
  });

  it.each([
    ["a dashboard the caller cannot open", ref(), true],
    ["an unknown widget", ref({ widgetId: "nope" }), false],
    ["a form's own write query", ref({ widgetId: "w-form" }), false],
    ["a content-only widget", ref({ widgetId: "w-md" }), false],
    [
      "an unknown form field",
      ref({ widgetId: "w-form", seed: { fieldId: "zz" } }),
      false,
    ],
    ["a widget with no seed", ref({ seed: {} }), false],
  ])("refuses %s with one 404 and runs nothing", async (_n, r, noAccess) => {
    if (noAccess) mockAccess.mockResolvedValue(null);
    const res = await post({ ref: r });
    expect(res.status).toBe(404);
    expect((await res.json()).error.message).toBe("Widget not found");
    expect(mockExecuteQuery).not.toHaveBeenCalled();
  });

  it("ignores a request database: the saved widget's own choice, here the connection default, runs (#1822)", async () => {
    const res = await post({
      ref: ref({ widgetId: "w-param", seed: {} }),
      database: "other",
    });
    expect(res.status).toBe(200);
    expect(mockExecuteQuery.mock.calls[0][1].database).toBe("neo4j");
  });

  it("refuses a connection other than the one the widget is saved on", async () => {
    const res = await POST(makeRequest({ connectionId: "c2", ref: ref() }));
    expect(res.status).toBe(404);
    expect(mockExecuteQuery).not.toHaveBeenCalled();
  });

  it.each([
    ["both text and a reference", { query: "MATCH (n) RETURN n", ref: ref() }],
    ["neither", {}],
  ])("answers 400 for %s", async (_n, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(mockExecuteQuery).not.toHaveBeenCalled();
  });
});
