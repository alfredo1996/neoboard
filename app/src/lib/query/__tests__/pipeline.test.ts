import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildPipeline, runPipeline } from "../pipeline";
import type {
  QueryContext,
  QueryMiddlewareFn,
  QueryResult,
} from "../pipeline-types";
import { extensions } from "@/lib/extensions";

function makeContext(): QueryContext {
  return {
    query: "MATCH (n) RETURN n",
    params: {},
    connectionId: "conn-1",
    connectionType: "neo4j",
    userId: "user-1",
    tenantId: "tenant-1",
    accessMode: "read",
    metadata: {},
  };
}

function makeCore(result: Partial<QueryResult> = {}) {
  return vi.fn(async () => ({
    data: [],
    truncated: false,
    rowLimit: 5000,
    ...result,
  }));
}

describe("buildPipeline", () => {
  it("with no middleware returns a function that just runs the core", async () => {
    const core = makeCore({ data: ["a"] });
    const pipeline = buildPipeline([], core);
    const result = await pipeline(makeContext());
    expect(core).toHaveBeenCalledTimes(1);
    expect(result.data).toEqual(["a"]);
  });

  it("runs a single middleware around the core", async () => {
    const core = makeCore();
    const calls: string[] = [];
    const mw: QueryMiddlewareFn = async (ctx, next) => {
      calls.push("before");
      const result = await next();
      calls.push("after");
      return result;
    };
    await buildPipeline([mw], core)(makeContext());
    expect(calls).toEqual(["before", "after"]);
    expect(core).toHaveBeenCalledTimes(1);
  });

  it("correctly nests middleware (outer wraps inner)", async () => {
    const core = makeCore();
    const order: string[] = [];
    const mw =
      (id: string): QueryMiddlewareFn =>
      async (_ctx, next) => {
        order.push(`${id}-before`);
        const r = await next();
        order.push(`${id}-after`);
        return r;
      };
    await buildPipeline(
      [mw("outer"), mw("middle"), mw("inner")],
      core,
    )(makeContext());
    expect(order).toEqual([
      "outer-before",
      "middle-before",
      "inner-before",
      "inner-after",
      "middle-after",
      "outer-after",
    ]);
  });

  it("short-circuits when a middleware does not call next", async () => {
    const core = makeCore();
    const cachedResult: QueryResult = { data: ["cached"], truncated: false };
    const shortCircuit: QueryMiddlewareFn = async () => cachedResult;
    const result = await buildPipeline([shortCircuit], core)(makeContext());
    expect(result).toBe(cachedResult);
    expect(core).not.toHaveBeenCalled();
  });

  it("propagates errors from middleware", async () => {
    const core = makeCore();
    const boom: QueryMiddlewareFn = async () => {
      throw new Error("mw error");
    };
    await expect(buildPipeline([boom], core)(makeContext())).rejects.toThrow(
      "mw error",
    );
    expect(core).not.toHaveBeenCalled();
  });

  it("propagates errors from the core executor", async () => {
    const core = vi.fn(async () => {
      throw new Error("db error");
    });
    const mw: QueryMiddlewareFn = async (_ctx, next) => next();
    await expect(buildPipeline([mw], core)(makeContext())).rejects.toThrow(
      "db error",
    );
  });

  it("allows middleware to mutate the context before core runs", async () => {
    const core = vi.fn(async (ctx: QueryContext) => ({
      data: { seenQuery: ctx.query },
      truncated: false,
      rowLimit: 5000,
    }));
    const rewrite: QueryMiddlewareFn = async (ctx, next) => {
      ctx.query = "REWRITTEN";
      return next();
    };
    const result = await buildPipeline([rewrite], core)(makeContext());
    expect((result.data as { seenQuery: string }).seenQuery).toBe("REWRITTEN");
  });
});

describe("runPipeline", () => {
  beforeEach(() => {
    extensions.queryMiddleware.clear();
  });

  it("runs the core directly when no middleware is registered", async () => {
    const core = makeCore({ data: ["direct"] });
    const result = await runPipeline(makeContext(), core);
    expect(result.data).toEqual(["direct"]);
    expect(core).toHaveBeenCalledTimes(1);
  });

  it("runs registered middleware in priority order (lowest first)", async () => {
    const order: string[] = [];
    extensions.queryMiddleware.register({
      id: "late",
      priority: 100,
      middleware: async (_c, next) => {
        order.push("late-before");
        const r = await next();
        order.push("late-after");
        return r;
      },
    });
    extensions.queryMiddleware.register({
      id: "early",
      priority: 1,
      middleware: async (_c, next) => {
        order.push("early-before");
        const r = await next();
        order.push("early-after");
        return r;
      },
    });

    await runPipeline(makeContext(), makeCore());

    expect(order).toEqual([
      "early-before",
      "late-before",
      "late-after",
      "early-after",
    ]);
  });

  it("treats missing priority as priority 50 (runs in registration order)", async () => {
    const order: string[] = [];
    extensions.queryMiddleware.register({
      id: "a",
      middleware: async (_c, next) => {
        order.push("a");
        return next();
      },
    });
    extensions.queryMiddleware.register({
      id: "b",
      middleware: async (_c, next) => {
        order.push("b");
        return next();
      },
    });

    await runPipeline(makeContext(), makeCore());

    expect(order).toEqual(["a", "b"]);
  });

  it("passes the context through to every middleware", async () => {
    const seen: QueryContext[] = [];
    extensions.queryMiddleware.register({
      id: "spy",
      middleware: async (ctx, next) => {
        seen.push(ctx);
        return next();
      },
    });
    const ctx = makeContext();
    ctx.metadata.cacheKey = "abc";
    await runPipeline(ctx, makeCore());
    expect(seen[0]).toBe(ctx);
    expect(seen[0].metadata.cacheKey).toBe("abc");
  });
});
