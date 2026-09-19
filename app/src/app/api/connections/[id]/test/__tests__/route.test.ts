import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeParams, makeRequest } from "@/__tests__/helpers/request-helpers";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";
import {
  makeSelectChain as recordingSelectChain,
  sqlColumns,
  sqlValues,
} from "@/__tests__/helpers/drizzle-mocks";

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
const mockTestConnection = vi.fn();
const mockForgetDeadConnector = vi.fn();

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
vi.mock("@/lib/query/query-executor", () => ({
  testConnection: mockTestConnection,
}));
vi.mock("@/lib/query/middleware/dead-connector", () => ({
  forgetDeadConnector: mockForgetDeadConnector,
}));
vi.mock("next/server", () => nextResponseMockFactory());
vi.mock("@/lib/auth/errors", () => ({ UnauthorizedError, ForbiddenError }));
// Every logger the route's module graph can reach writes here, so a test can
// read back everything that was logged.
const mockLog = vi.fn();
vi.mock("@/lib/logger", () => {
  const spy = { error: mockLog, warn: mockLog, info: mockLog, debug: mockLog };
  return { logger: spy, apiLogger: spy, queryLogger: spy, authLogger: spy };
});

const SESSION = {
  userId: "user-1",
  role: "creator",
  canWrite: true,
  tenantId: "t1",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/connections/[id]/test", () => {
  let POST: (
    req: Request,
    ctx: { params: Promise<{ id: string }> },
  ) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    // The schedulers outlive a module reset: they sit on globalThis (#1426).
    (await import("@/lib/query/scheduler-registry")).resetSchedulerRegistry();
    const mod = await import("../route");
    POST = mod.POST;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockRejectedValue(new UnauthorizedError());
    const res = await POST(makeRequest(null), makeParams("c1"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 404 when connection not found or not owned", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await POST(makeRequest(null), makeParams("c1"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns success:true when test passes", async () => {
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
    mockTestConnection.mockResolvedValue(true);

    const res = await POST(makeRequest(null), makeParams("c1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.success).toBe(true);
    expect(body.error).toBeNull();
  });

  it("clears the dead-connector memo when the test passes, and only then (#1888)", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const conn = {
      id: "c1",
      userId: "user-1",
      type: "neo4j",
      configEncrypted: "enc",
    };
    mockDb.select.mockReturnValue(makeSelectChain([conn]));
    mockDecryptJson.mockReturnValue({ uri: "bolt://x", username: "u" });

    mockTestConnection.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await POST(makeRequest(null), makeParams("c1"));
    expect(mockForgetDeadConnector).not.toHaveBeenCalled();

    mockTestConnection.mockResolvedValueOnce(true);
    await POST(makeRequest(null), makeParams("c1"));
    expect(mockForgetDeadConnector).toHaveBeenCalledExactlyOnceWith("t1", "c1");
  });

  it("returns success:false with error message when testConnection throws", async () => {
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
    mockTestConnection.mockRejectedValue(new Error("Connection refused"));

    const res = await POST(makeRequest(null), makeParams("c1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.success).toBe(false);
    expect(body.data.error).toBe("Connection refused");
    // The error is classified so the UI can show a targeted hint (#1043).
    expect(body.data.code).toBe("network");
  });

  it("classifies an auth failure thrown by testConnection (#1043)", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValue(
      makeSelectChain([
        { id: "c1", userId: "user-1", type: "neo4j", configEncrypted: "enc" },
      ]),
    );
    mockDecryptJson.mockReturnValue({ uri: "bolt://h", username: "u" });
    mockTestConnection.mockRejectedValue(
      new Error("The client is unauthorized due to authentication failure."),
    );

    const res = await POST(makeRequest(null), makeParams("c1"));
    const body = await res.json();
    expect(body.data.success).toBe(false);
    expect(body.data.code).toBe("auth_failed");
  });

  it("returns an actionable message + code when testConnection returns false (#1043)", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValue(
      makeSelectChain([
        {
          id: "c1",
          userId: "user-1",
          type: "postgresql",
          configEncrypted: "enc",
        },
      ]),
    );
    mockDecryptJson.mockReturnValue({ uri: "pg://h", username: "u" });
    mockTestConnection.mockResolvedValue(false);

    const res = await POST(makeRequest(null), makeParams("c1"));
    const body = await res.json();
    expect(body.data.success).toBe(false);
    expect(body.data.code).toBe("unknown");
    // No longer the dead-end "Connection check returned false".
    expect(body.data.error).not.toMatch(/check returned false/i);
    expect(body.data.error).toMatch(/verify the host, port, credentials/i);
  });

  // Lost/rotated ENCRYPTION_KEY is a documented operational failure mode —
  // it must surface as an actionable test result, not an unhandled 500 (#1040).
  it("returns a structured decrypt_failed result when stored credentials can't be decrypted", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const conn = {
      id: "c1",
      userId: "user-1",
      type: "postgresql",
      configEncrypted: "enc-with-wrong-key",
    };
    mockDb.select.mockReturnValue(makeSelectChain([conn]));
    // AES-GCM auth failure — exactly what Decipheriv.final throws
    mockDecryptJson.mockImplementation(() => {
      throw new Error("Unsupported state or unable to authenticate data");
    });

    const res = await POST(makeRequest(null), makeParams("c1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.success).toBe(false);
    expect(body.data.code).toBe("decrypt_failed");
    // Actionable: names the likely cause and the recovery path
    expect(body.data.error).toMatch(/can't be decrypted/i);
    expect(body.data.error).toMatch(/re-enter/i);
    // The connector must never be called with garbage credentials
    expect(mockTestConnection).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// #1426 — the probe takes a slot from the connection's scheduler
// ---------------------------------------------------------------------------
//
// The route used to call `testConnection` directly, so the one path that can
// open N connections at once was the one path with no concurrency control.
// The scheduler here is the real one; only its limits are set.

describe("POST /api/connections/[id]/test — scheduling (#1426)", () => {
  const SECRET = "s3cr3t-sentinel-password";
  let POST: (
    req: Request,
    ctx: { params: Promise<{ id: string }> },
  ) => Promise<Response>;
  let registry: typeof import("@/lib/query/scheduler-registry");

  /** Every probe the route starts waits here until the test lets it go. */
  let probes: Array<{ kind: string; finish: (ok: boolean) => void }>;

  const tick = () => new Promise<void>((r) => setImmediate(r));

  beforeEach(async () => {
    vi.resetModules();
    vi.resetAllMocks();
    registry = await import("@/lib/query/scheduler-registry");
    registry.resetSchedulerRegistry();
    registry.setDefaultSchedulerOptions({
      maxConcurrent: 1,
      maxPerUser: 1,
      maxQueueDepth: 1,
      queueTimeoutMs: 60_000,
      shedThreshold: 0.5,
    });
    POST = (await import("../route")).POST;

    probes = [];
    mockRequireSession.mockResolvedValue(SESSION);
    mockDecryptJson.mockReturnValue({
      uri: "scheme://db.internal",
      username: "svc",
      password: SECRET,
    });
    mockTestConnection.mockImplementation(
      (kind: string) =>
        new Promise<boolean>((resolve) => {
          probes.push({ kind, finish: resolve });
        }),
    );
  });

  /** Start a probe of connection `c1`; `kind` is how the test tells them apart. */
  function probe(kind: string, headers?: Record<string, string>, userId = "") {
    if (userId)
      mockRequireSession.mockResolvedValueOnce({ ...SESSION, userId });
    mockDb.select.mockReturnValueOnce(
      makeSelectChain([
        { id: "c1", userId: "user-1", type: kind, configEncrypted: "enc" },
      ]),
    );
    return POST(makeRequest(null, { headers }), makeParams("c1"));
  }

  it("respects the concurrency cap: a second probe waits for the first", async () => {
    const first = probe("first");
    await tick();
    const second = probe("second", undefined, "user-2");
    await tick();

    expect(probes.map((p) => p.kind)).toEqual(["first"]);
    expect(registry.getScheduler("c1").getStats()).toMatchObject({
      activeQueries: 1,
      queueDepth: 1,
    });

    probes[0].finish(true);
    await first;
    await tick();
    expect(probes.map((p) => p.kind)).toEqual(["first", "second"]);

    probes[1].finish(true);
    expect((await (await second).json()).data.success).toBe(true);
    expect(registry.getScheduler("c1").getStats().activeQueries).toBe(0);
  });

  it("answers a full queue with the standard 503 envelope, not a failed test", async () => {
    const first = probe("first");
    await tick();
    const second = probe("second", undefined, "user-2");
    await tick();

    const res = await probe("third", undefined, "user-3");
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("2");
    const body = await res.json();
    expect(body.data).toBeNull();
    expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
    expect(body.error.details).toEqual({ reason: "queue_full" });
    // It never reached the database, so it says nothing about the connection.
    expect(probes.map((p) => p.kind)).toEqual(["first"]);
    expect(mockForgetDeadConnector).not.toHaveBeenCalled();

    probes[0].finish(true);
    await first;
    await tick();
    probes[1].finish(true);
    await second;
  });

  it("answers a queue timeout with 408, not a failed test", async () => {
    registry.resetSchedulerRegistry();
    registry.setDefaultSchedulerOptions({
      maxConcurrent: 1,
      maxPerUser: 1,
      maxQueueDepth: 5,
      queueTimeoutMs: 10,
      shedThreshold: 0.9,
    });
    const first = probe("first");
    await tick();

    const res = await probe("second", undefined, "user-2");
    expect(res.status).toBe(408);
    expect((await res.json()).error.code).toBe("REQUEST_TIMEOUT");

    probes[0].finish(true);
    await first;
  });

  it("runs a single Test as interactive (P1), ahead of a Test-all probe (P2)", async () => {
    registry.resetSchedulerRegistry();
    registry.setDefaultSchedulerOptions({
      maxConcurrent: 1,
      maxPerUser: 1,
      maxQueueDepth: 5,
      queueTimeoutMs: 60_000,
      shedThreshold: 0.9,
    });
    const blocker = probe("blocker");
    await tick();
    const batch = probe("batch", { "x-query-priority": "2" }, "user-2");
    await tick();
    const single = probe("single", undefined, "user-3");
    await tick();
    expect(registry.getScheduler("c1").getStats().queueDepthByPriority).toEqual(
      { p1: 1, p2: 1, p3: 0 },
    );

    probes[0].finish(true);
    await blocker;
    await tick();
    expect(probes.map((p) => p.kind)).toEqual(["blocker", "single"]);

    probes[1].finish(true);
    await single;
    await tick();
    probes[2].finish(true);
    await batch;
  });

  it("never runs a probe as P3: a shed probe would tell the user nothing", async () => {
    const blocker = probe("blocker");
    await tick();
    const asked = probe("asked-p3", { "x-query-priority": "3" }, "user-2");
    await tick();
    expect(registry.getScheduler("c1").getStats().queueDepthByPriority).toEqual(
      { p1: 1, p2: 0, p3: 0 },
    );
    probes[0].finish(true);
    await blocker;
    await tick();
    probes[1].finish(true);
    await asked;
  });

  it("still clears the dead-connector memo when a scheduled probe passes (#1888)", async () => {
    const running = probe("only");
    await tick();
    probes[0].finish(true);
    await running;
    expect(mockForgetDeadConnector).toHaveBeenCalledExactlyOnceWith("t1", "c1");
  });

  it("frees the slot when the probe throws", async () => {
    mockTestConnection.mockReset();
    mockTestConnection.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await probe("throws");
    expect((await res.json()).data.success).toBe(false);
    expect(registry.getScheduler("c1").getStats().activeQueries).toBe(0);
  });

  it("looks the connection up by id AND the caller's own user id, before any slot is taken", async () => {
    const chain = recordingSelectChain([]);
    mockDb.select.mockReturnValueOnce(chain);
    const res = await POST(makeRequest(null), makeParams("c1"));

    expect(res.status).toBe(404);
    expect(sqlColumns(chain.calls.where[0][0]).sort()).toEqual([
      "id",
      "userId",
    ]);
    expect(sqlValues(chain.calls.where[0][0]).sort()).toEqual(["c1", "user-1"]);
    expect(mockTestConnection).not.toHaveBeenCalled();
    expect(registry.listSchedulers()).toEqual([]);
  });

  it("logs no decrypted credential on any path: pass, fail, busy", async () => {
    const consoleSpies = (
      ["log", "info", "warn", "error", "debug"] as const
    ).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));

    const pass = probe("pass");
    await tick();
    const queued = probe("queued", undefined, "user-2");
    await tick();
    const busy = await probe("busy", undefined, "user-3");
    expect(busy.status).toBe(503);
    probes[0].finish(true);
    await pass;
    await tick();
    probes[1].finish(false);
    await queued;

    mockTestConnection.mockReset();
    mockTestConnection.mockRejectedValue(
      new Error(`authentication failed for svc:${SECRET}`),
    );
    await probe("fail");

    const logged = JSON.stringify([
      mockLog.mock.calls,
      ...consoleSpies.map((s) => s.mock.calls),
    ]);
    expect(logged).not.toContain(SECRET);
    consoleSpies.forEach((s) => s.mockRestore());
  });
});
