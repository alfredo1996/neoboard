/**
 * POST /api/mcp — MCP Streamable HTTP transport and its five read tools (#1694).
 *
 * Mocked: session, metadata DB, decryption, the query pipeline, the driver and
 * schema introspection. Real: the transport, the tools, and the access helpers
 * they share with the REST routes (listDashboards, listConnections,
 * getVisibleConnectionSchema, runReadQuery) — so a tenant or access-mode slip
 * in any of them fails here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  makeSelectChain,
  resetDbMock,
  sqlValues,
} from "@/__tests__/helpers/drizzle-mocks";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";

const mockRequireSession = vi.fn();
const mockDb = { select: vi.fn(), selectDistinctOn: vi.fn() };
const mockDecryptJson = vi.fn();
const mockExecuteQuery = vi.fn();
const mockFetchConnectionSchema = vi.fn();
const mockRunPipeline = vi.fn();

vi.mock("@/lib/auth/session", () => ({ requireSession: mockRequireSession }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/crypto/crypto", () => ({ decryptJson: mockDecryptJson }));
vi.mock("@/lib/query/query-executor", () => ({
  executeQuery: mockExecuteQuery,
  toConnectorAccessMode: (m: "read" | "write") =>
    m === "write" ? "WRITE" : "READ",
}));
vi.mock("@/lib/query/pipeline", () => ({ runPipeline: mockRunPipeline }));
vi.mock("@/lib/connector/schema-prefetch", () => ({
  fetchConnectionSchema: mockFetchConnectionSchema,
}));
vi.mock("next/server", () => nextResponseMockFactory());

const APP = "http://localhost:3000";
const SESSION = {
  userId: "user-1",
  tenantId: "tenant-a",
  role: "creator",
  canWrite: true,
};
const CONNECTION = {
  id: "c1",
  type: "neo4j",
  configEncrypted: "enc",
  userId: "user-1",
  allowPerCardDb: false,
};
const CREDENTIALS = {
  uri: "neo4j://db:7687",
  username: "neo4j",
  password: "pw",
};

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${APP}/api/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const rpc = (method: string, params?: Record<string, unknown>) => ({
  jsonrpc: "2.0",
  id: 1,
  method,
  ...(params ? { params } : {}),
});

const call = (name: string, args?: Record<string, unknown>) =>
  rpc("tools/call", { name, ...(args ? { arguments: args } : {}) });

/** The single text block of a tools/call result. */
async function toolResult(res: Response) {
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.error).toBeUndefined();
  expect(body.result.content).toHaveLength(1);
  expect(body.result.content[0].type).toBe("text");
  return {
    isError: body.result.isError === true,
    text: body.result.content[0].text as string,
  };
}

/** makeSelectChain, with limit/offset recorded too. */
function pagedChain(rows: unknown[]) {
  const chain = makeSelectChain(rows);
  return Object.assign(chain, {
    limit: vi.fn(() => chain),
    offset: vi.fn(() => chain),
  });
}

describe("POST /api/mcp", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mixes real Responses and the NextResponse stub
  let POST: (req: Request) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    resetDbMock(mockDb);
    vi.unstubAllEnvs();
    vi.stubEnv("NEXTAUTH_URL", "");
    mockRequireSession.mockResolvedValue(SESSION);
    mockRunPipeline.mockImplementation((ctx, core) => core(ctx));
    POST = (await import("../route")).POST;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // ── Transport ──────────────────────────────────────────────────────────

  it("returns 401 when the API key or session does not resolve", async () => {
    mockRequireSession.mockRejectedValue(new Error("Unauthorized"));
    const res = await POST(post(rpc("tools/list")));
    expect(res.status).toBe(401);
  });

  it("rejects a foreign browser Origin with 403 before authenticating", async () => {
    const res = await POST(
      post(rpc("tools/list"), { origin: "https://evil.example" }),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe(-32000);
    expect(mockRequireSession).not.toHaveBeenCalled();
  });

  it("accepts the app's own Origin", async () => {
    const res = await POST(post(rpc("ping"), { origin: APP }));
    expect(res.status).toBe(200);
  });

  it("checks Origin against NEXTAUTH_URL when set, not the Host a rebinding attacker controls", async () => {
    vi.stubEnv("NEXTAUTH_URL", "https://neoboard.example.com/");
    const sameHost = await POST(post(rpc("ping"), { origin: APP }));
    expect(sameHost.status).toBe(403);
    const configured = await POST(
      post(rpc("ping"), { origin: "https://neoboard.example.com" }),
    );
    expect(configured.status).toBe(200);
  });

  it("returns 400 for an unsupported MCP-Protocol-Version header", async () => {
    const res = await POST(
      post(rpc("ping"), { "mcp-protocol-version": "1999-01-01" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns -32700 for a body that is not JSON", async () => {
    const res = await POST(post("{not json"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ jsonrpc: "2.0", id: null });
    expect(body.error.code).toBe(-32700);
  });

  it.each([
    ["no jsonrpc version", { id: 1, method: "ping" }],
    ["a batch", [rpc("ping")]],
    ["a null id", { jsonrpc: "2.0", id: null, method: "ping" }],
    ["no method", { jsonrpc: "2.0", id: 1 }],
  ])("returns -32600 for %s", async (_label, message) => {
    const res = await POST(post(message));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe(-32600);
  });

  it("accepts a notification with 202 and no body", async () => {
    const res = await POST(
      post({ jsonrpc: "2.0", method: "notifications/initialized" }),
    );
    expect(res.status).toBe(202);
    expect(await res.text()).toBe("");
  });

  it("returns -32601 for an unknown method", async () => {
    const res = await POST(post(rpc("resources/list")));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ jsonrpc: "2.0", id: 1 });
    expect(body.error.code).toBe(-32601);
  });

  it("initialize echoes a supported protocol version and advertises tools", async () => {
    const res = await POST(
      post(rpc("initialize", { protocolVersion: "2025-06-18" })),
    );
    const { result } = await res.json();
    expect(result.protocolVersion).toBe("2025-06-18");
    expect(result.capabilities).toEqual({ tools: {} });
    expect(result.serverInfo.name).toBe("neoboard");
    expect(typeof result.serverInfo.version).toBe("string");
  });

  it("initialize answers with its newest version when the client's is unsupported", async () => {
    const res = await POST(
      post(rpc("initialize", { protocolVersion: "2024-11-05" })),
    );
    expect((await res.json()).result.protocolVersion).toBe("2025-11-25");
  });

  it("answers ping with an empty result", async () => {
    const res = await POST(post(rpc("ping")));
    expect(await res.json()).toEqual({ jsonrpc: "2.0", id: 1, result: {} });
  });

  it("lists exactly the five read tools, each with an object input schema", async () => {
    const res = await POST(post(rpc("tools/list")));
    const { tools } = (await res.json()).result;
    expect(tools.map((t: { name: string }) => t.name).sort()).toEqual([
      "get_schema",
      "list_connections",
      "list_dashboards",
      "ping",
      "run_query",
    ]);
    for (const tool of tools) {
      expect(tool.description).toEqual(expect.any(String));
      expect(tool.inputSchema.type).toBe("object");
    }
    const runQuery = tools.find(
      (t: { name: string }) => t.name === "run_query",
    );
    expect(runQuery.inputSchema.required).toEqual(["connectionId", "query"]);
  });

  // ── tools/call protocol errors ─────────────────────────────────────────

  it("returns -32602 for an unknown tool", async () => {
    const res = await POST(post(call("drop_database")));
    expect((await res.json()).error.code).toBe(-32602);
  });

  it("returns -32602 when tools/call has no tool name", async () => {
    const res = await POST(post(rpc("tools/call", { arguments: {} })));
    expect((await res.json()).error.code).toBe(-32602);
  });

  it.each([
    ["run_query without a query", call("run_query", { connectionId: "c1" })],
    ["list_dashboards with limit 0", call("list_dashboards", { limit: 0 })],
    ["get_schema with a numeric id", call("get_schema", { connectionId: 42 })],
  ])("returns -32602 for %s", async (_label, message) => {
    const res = await POST(post(message));
    expect((await res.json()).error.code).toBe(-32602);
    expect(mockRunPipeline).not.toHaveBeenCalled();
  });

  // ── Tools ──────────────────────────────────────────────────────────────

  it("ping reports who the key belongs to", async () => {
    const { isError, text } = await toolResult(await POST(post(call("ping"))));
    expect(isError).toBe(false);
    expect(JSON.parse(text)).toEqual({
      pong: true,
      userId: "user-1",
      role: "creator",
    });
  });

  it("list_dashboards scopes by the session tenant, never an argument, and pages", async () => {
    const countChain = makeSelectChain([{ count: 7 }]);
    const rowsChain = pagedChain([
      {
        id: "d1",
        name: "Movies",
        ownerId: "user-1",
        shareRole: null,
        layoutJson: null,
      },
    ]);
    mockDb.select.mockReturnValueOnce(countChain);
    mockDb.selectDistinctOn.mockReturnValueOnce(rowsChain);

    const { isError, text } = await toolResult(
      await POST(
        post(
          call("list_dashboards", {
            limit: 10,
            offset: 5,
            tenantId: "tenant-evil",
          }),
        ),
      ),
    );

    expect(isError).toBe(false);
    for (const chain of [countChain, rowsChain]) {
      const values = sqlValues(chain.calls.where[0][0]);
      expect(values).toContain("tenant-a");
      expect(values).not.toContain("tenant-evil");
    }
    expect(rowsChain.limit).toHaveBeenCalledWith(10);
    expect(rowsChain.offset).toHaveBeenCalledWith(5);
    expect(JSON.parse(text)).toEqual({
      dashboards: [{ id: "d1", name: "Movies", role: "owner", widgetCount: 0 }],
      total: 7,
      limit: 10,
      offset: 5,
    });
  });

  it("list_connections applies own-or-shared visibility in the session tenant", async () => {
    const countChain = makeSelectChain([{ count: 1 }]);
    const rowsChain = pagedChain([
      {
        id: "c1",
        name: "Movies",
        type: "neo4j",
        ownerId: "user-2",
        visibility: "shared",
      },
    ]);
    mockDb.select
      .mockReturnValueOnce(countChain)
      .mockReturnValueOnce(rowsChain);

    const { text } = await toolResult(
      await POST(post(call("list_connections"))),
    );

    const values = sqlValues(rowsChain.calls.where[0][0]);
    expect(values).toEqual(
      expect.arrayContaining(["tenant-a", "user-1", "shared"]),
    );
    expect(rowsChain.limit).toHaveBeenCalledWith(25);
    expect(rowsChain.offset).toHaveBeenCalledWith(0);
    expect(JSON.parse(text)).toEqual({
      connections: [
        {
          id: "c1",
          name: "Movies",
          type: "neo4j",
          visibility: "shared",
          isOwner: false,
        },
      ],
      total: 1,
      limit: 25,
      offset: 0,
    });
  });

  it("get_schema introspects a visible connection with its decrypted credentials", async () => {
    const chain = makeSelectChain([CONNECTION]);
    mockDb.select.mockReturnValueOnce(chain);
    mockDecryptJson.mockReturnValue(CREDENTIALS);
    mockFetchConnectionSchema.mockResolvedValue({ labels: ["Movie"] });

    const { isError, text } = await toolResult(
      await POST(post(call("get_schema", { connectionId: "c1" }))),
    );

    expect(isError).toBe(false);
    expect(JSON.parse(text)).toEqual({ labels: ["Movie"] });
    expect(mockFetchConnectionSchema).toHaveBeenCalledWith(
      "neo4j",
      CREDENTIALS,
    );
    expect(sqlValues(chain.calls.where[0][0])).toEqual(
      expect.arrayContaining(["c1", "tenant-a", "user-1", "shared"]),
    );
  });

  it("get_schema returns a tool error for a connection the caller cannot see", async () => {
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    const { isError, text } = await toolResult(
      await POST(post(call("get_schema", { connectionId: "c9" }))),
    );
    expect(isError).toBe(true);
    expect(text).toBe("Connection not found");
    expect(mockFetchConnectionSchema).not.toHaveBeenCalled();
  });

  it("run_query goes through the pipeline in READ mode, unmodified, and forwards the row limit", async () => {
    mockDb.select.mockReturnValueOnce(makeSelectChain([CONNECTION]));
    mockDecryptJson.mockReturnValue(CREDENTIALS);
    mockExecuteQuery.mockResolvedValue({
      data: [{ n: 1 }],
      fields: ["n"],
      truncated: true,
      rowLimit: 5000,
    });

    const { isError, text } = await toolResult(
      await POST(
        post(
          call("run_query", {
            connectionId: "c1",
            query: "MATCH (n) RETURN count(n) AS n",
            params: { x: 1 },
            tenantId: "tenant-evil",
          }),
          { "x-request-id": "req-42" },
        ),
      ),
    );

    expect(isError).toBe(false);
    expect(mockRunPipeline).toHaveBeenCalledTimes(1);
    expect(mockRunPipeline.mock.calls[0][0]).toMatchObject({
      query: "MATCH (n) RETURN count(n) AS n",
      params: { x: 1 },
      connectionId: "c1",
      connectionType: "neo4j",
      userId: "user-1",
      tenantId: "tenant-a",
      accessMode: "read",
      metadata: { requestId: "req-42" },
    });
    expect(mockExecuteQuery).toHaveBeenCalledWith(
      "neo4j",
      CREDENTIALS,
      { query: "MATCH (n) RETURN count(n) AS n", params: { x: 1 } },
      { accessMode: "READ" },
    );
    expect(JSON.parse(text)).toEqual({
      data: [{ n: 1 }],
      fields: ["n"],
      rowLimit: 5000,
      truncated: true,
    });
  });

  it("run_query returns a tool error when the connection is not reachable for the caller", async () => {
    // Fast path, then the dashboard-access fallback: both empty.
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([]))
      .mockReturnValueOnce(makeSelectChain([]));

    const { isError, text } = await toolResult(
      await POST(
        post(call("run_query", { connectionId: "c9", query: "RETURN 1" })),
      ),
    );

    expect(isError).toBe(true);
    expect(text).toBe("Connection not found");
    expect(mockRunPipeline).not.toHaveBeenCalled();
  });

  it("run_query turns a driver failure into a tool error with credentials redacted", async () => {
    mockDb.select.mockReturnValueOnce(makeSelectChain([CONNECTION]));
    mockDecryptJson.mockReturnValue(CREDENTIALS);
    mockExecuteQuery.mockRejectedValue(
      new Error("Could not reach neo4j://neo4j:s3cret@db:7687"),
    );

    const { isError, text } = await toolResult(
      await POST(
        post(call("run_query", { connectionId: "c1", query: "RETURN 1" })),
      ),
    );

    expect(isError).toBe(true);
    expect(text).toContain("Could not reach");
    expect(text).not.toContain("s3cret");
  });
});
