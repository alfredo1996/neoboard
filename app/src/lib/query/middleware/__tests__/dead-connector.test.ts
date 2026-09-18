import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  deadConnectorMiddleware,
  forgetDeadConnector,
  resetDeadConnectors,
  DEAD_CONNECTOR_TTL_MS,
} from "../dead-connector";
import type { QueryContext, QueryResult } from "@/lib/query/pipeline-types";

function makeContext(overrides: Partial<QueryContext> = {}): QueryContext {
  return {
    query: "MATCH (n) RETURN n",
    params: {},
    connectionId: "conn-1",
    connectionType: "neo4j",
    userId: "user-1",
    tenantId: "tenant-1",
    accessMode: "read",
    metadata: {},
    ...overrides,
  };
}

/** What `wrapError` in the connector SDK produces for a refused port. */
function connectorError(message: string): Error {
  const error = new Error(message);
  error.name = "ConnectorError";
  return error;
}

const unreachable = () => connectorError("connect ECONNREFUSED 10.0.0.1:7687");
const ok: QueryResult = { data: [1] };

describe("deadConnectorMiddleware (#1888)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetDeadConnectors();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("passes a healthy query straight through", async () => {
    const next = vi.fn(async () => ok);
    expect(await deadConnectorMiddleware(makeContext(), next)).toBe(ok);
    expect(next).toHaveBeenCalledOnce();
  });

  it("answers a known-dead connector without dialling again", async () => {
    const failure = unreachable();
    await expect(
      deadConnectorMiddleware(makeContext(), async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    const next = vi.fn(async () => ok);
    await expect(deadConnectorMiddleware(makeContext(), next)).rejects.toBe(
      failure,
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("dials again once the TTL has passed", async () => {
    await expect(
      deadConnectorMiddleware(makeContext(), async () => {
        throw unreachable();
      }),
    ).rejects.toThrow();

    vi.advanceTimersByTime(DEAD_CONNECTOR_TTL_MS + 1);

    const next = vi.fn(async () => ok);
    expect(await deadConnectorMiddleware(makeContext(), next)).toBe(ok);
    expect(next).toHaveBeenCalledOnce();
  });

  it("remembers bad credentials too", async () => {
    await expect(
      deadConnectorMiddleware(makeContext(), async () => {
        throw connectorError(
          "The client is unauthorized due to authentication failure.",
        );
      }),
    ).rejects.toThrow();

    const next = vi.fn(async () => ok);
    await expect(deadConnectorMiddleware(makeContext(), next)).rejects.toThrow(
      /unauthorized/,
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("never remembers an error the database itself returned", async () => {
    // A syntax error proves the connector answered.
    await expect(
      deadConnectorMiddleware(makeContext(), async () => {
        throw connectorError("Invalid input 'RETRUN': expected 'RETURN'");
      }),
    ).rejects.toThrow();
    // Nor one that is not a connector error at all (scheduler backpressure).
    await expect(
      deadConnectorMiddleware(makeContext(), async () => {
        throw new Error("connect ECONNREFUSED 10.0.0.1:7687");
      }),
    ).rejects.toThrow();

    const next = vi.fn(async () => ok);
    expect(await deadConnectorMiddleware(makeContext(), next)).toBe(ok);
  });

  it("keys on tenant and connection", async () => {
    await expect(
      deadConnectorMiddleware(makeContext(), async () => {
        throw unreachable();
      }),
    ).rejects.toThrow();

    const next = vi.fn(async () => ok);
    await deadConnectorMiddleware(
      makeContext({ connectionId: "conn-2" }),
      next,
    );
    await deadConnectorMiddleware(makeContext({ tenantId: "tenant-2" }), next);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it("forgets a connector on request, for one tenant only", async () => {
    const dead = async () => {
      throw unreachable();
    };
    await expect(
      deadConnectorMiddleware(makeContext(), dead),
    ).rejects.toThrow();
    await expect(
      deadConnectorMiddleware(makeContext({ tenantId: "tenant-2" }), dead),
    ).rejects.toThrow();

    forgetDeadConnector("tenant-1", "conn-1");

    const next = vi.fn(async () => ok);
    expect(await deadConnectorMiddleware(makeContext(), next)).toBe(ok);
    await expect(
      deadConnectorMiddleware(makeContext({ tenantId: "tenant-2" }), next),
    ).rejects.toThrow();
    expect(next).toHaveBeenCalledOnce();
  });
});

// The middleware is registered from instrumentation's bundle and
// forgetDeadConnector is called from a route's: two copies of this module
// that must share one memo.
describe("dead-connector memo — one per process (#1888)", () => {
  it("lets a second copy of the module forget what the first remembered", async () => {
    resetDeadConnectors();
    const ctx = makeContext();
    await expect(
      deadConnectorMiddleware(ctx, async () => {
        throw unreachable();
      }),
    ).rejects.toThrow();

    vi.resetModules();
    const second = await import("../dead-connector");
    second.forgetDeadConnector(ctx.tenantId, ctx.connectionId);

    const next = vi.fn(async () => ok);
    expect(await deadConnectorMiddleware(ctx, next)).toBe(ok);
  });
});
