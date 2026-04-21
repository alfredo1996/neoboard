import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { auditMiddleware } from "../audit";
import type { QueryContext, QueryResult } from "@/lib/query/pipeline-types";

// Spy on the queryLogger before the module that uses it is imported.
const logged: Array<{
  level: string;
  obj: Record<string, unknown>;
  msg: string;
}> = [];

vi.mock("@/lib/logger", () => {
  const child = {
    info: (obj: Record<string, unknown>, msg: string) =>
      logged.push({ level: "info", obj, msg }),
    warn: (obj: Record<string, unknown>, msg: string) =>
      logged.push({ level: "warn", obj, msg }),
    error: () => {},
    debug: () => {},
  };
  return {
    queryLogger: child,
    authLogger: child,
    apiLogger: child,
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
  };
});

function makeContext(overrides: Partial<QueryContext> = {}): QueryContext {
  return {
    query: "MATCH (n) RETURN n",
    params: {},
    connectionId: "conn-1",
    connectionType: "neo4j",
    userId: "user-42",
    tenantId: "tenant-a",
    accessMode: "read",
    metadata: {},
    ...overrides,
  };
}

describe("auditMiddleware", () => {
  beforeEach(() => {
    logged.length = 0;
  });

  afterEach(() => {
    logged.length = 0;
  });

  it("logs query_executed on success with the full audit shape", async () => {
    const core = vi.fn(
      async (): Promise<QueryResult> => ({
        data: [{ name: "Alice" }, { name: "Bob" }],
        truncated: false,
        rowLimit: 5000,
      }),
    );
    const ctx = makeContext();
    const result = await auditMiddleware(ctx, () => core());

    expect(result.data).toEqual([{ name: "Alice" }, { name: "Bob" }]);
    expect(logged).toHaveLength(1);
    const entry = logged[0];
    expect(entry.level).toBe("info");
    expect(entry.msg).toBe("query_executed");
    expect(entry.obj.event).toBe("query_executed");
    expect(entry.obj.status).toBe("success");
    expect(entry.obj.userId).toBe("user-42");
    expect(entry.obj.tenantId).toBe("tenant-a");
    expect(entry.obj.connectionId).toBe("conn-1");
    expect(entry.obj.connectionType).toBe("neo4j");
    expect(entry.obj.accessMode).toBe("read");
    expect(entry.obj.query).toBe("MATCH (n) RETURN n");
    expect(entry.obj.rowCount).toBe(2);
    expect(typeof entry.obj.durationMs).toBe("number");
  });

  it("counts rows when result.data is a { rows: [...] } object", async () => {
    const core = async (): Promise<QueryResult> => ({
      data: { rows: [1, 2, 3, 4] },
      truncated: false,
    });
    await auditMiddleware(makeContext(), core);
    expect(logged[0].obj.rowCount).toBe(4);
  });

  it("defaults rowCount to 0 when data shape is unknown", async () => {
    const core = async (): Promise<QueryResult> => ({
      data: { something: "else" },
      truncated: false,
    });
    await auditMiddleware(makeContext(), core);
    expect(logged[0].obj.rowCount).toBe(0);
  });

  it("includes requestId from ctx.metadata when present", async () => {
    const core = async (): Promise<QueryResult> => ({
      data: [],
      truncated: false,
    });
    const ctx = makeContext();
    ctx.metadata.requestId = "req-abc-123";
    await auditMiddleware(ctx, core);
    expect(logged[0].obj.requestId).toBe("req-abc-123");
  });

  it("emits truncated flag when result is truncated", async () => {
    const core = async (): Promise<QueryResult> => ({
      data: [],
      truncated: true,
      rowLimit: 5000,
    });
    await auditMiddleware(makeContext(), core);
    expect(logged[0].obj.truncated).toBe(true);
    expect(logged[0].obj.rowLimit).toBe(5000);
  });

  it("omits truncated flag when not truncated (cleaner logs)", async () => {
    const core = async (): Promise<QueryResult> => ({
      data: [],
      truncated: false,
    });
    await auditMiddleware(makeContext(), core);
    expect(logged[0].obj.truncated).toBeUndefined();
  });

  it("logs query_failed with a warn level when the core throws", async () => {
    const core = async (): Promise<QueryResult> => {
      throw new Error("connection refused");
    };
    await expect(auditMiddleware(makeContext(), core)).rejects.toThrow(
      "connection refused",
    );
    expect(logged).toHaveLength(1);
    expect(logged[0].level).toBe("warn");
    expect(logged[0].msg).toBe("query_failed");
    expect(logged[0].obj.event).toBe("query_failed");
    expect(logged[0].obj.status).toBe("error");
    // err key carries the full Error for pino.stdSerializers
    expect(logged[0].obj.err).toBeInstanceOf(Error);
    expect((logged[0].obj.err as Error).message).toBe("connection refused");
    // errorCode for machine-readable filtering
    expect(logged[0].obj.errorCode).toBe("Error");
    expect(typeof logged[0].obj.durationMs).toBe("number");
  });

  it("re-throws the original error so upstream handlers see it", async () => {
    const original = new Error("boom");
    const core = async (): Promise<QueryResult> => {
      throw original;
    };
    await expect(auditMiddleware(makeContext(), core)).rejects.toBe(original);
  });

  it("includes schedulerWaitMs from ctx.metadata when present", async () => {
    const core = async (): Promise<QueryResult> => ({ data: [] });
    const ctx = makeContext({ metadata: { schedulerWaitMs: 142 } });
    await auditMiddleware(ctx, core);
    expect(logged[0].obj.schedulerWaitMs).toBe(142);
  });

  it("omits schedulerWaitMs when not set (scheduler middleware didn't run)", async () => {
    const core = async (): Promise<QueryResult> => ({ data: [] });
    await auditMiddleware(makeContext(), core);
    expect(logged[0].obj.schedulerWaitMs).toBeUndefined();
  });
});
