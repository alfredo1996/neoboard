/**
 * useConnectionSchema — pure-logic tests (node environment, no DOM).
 *
 * The hook's React/TanStack Query lifecycle is tested via Playwright E2E.
 * Here we test the Zustand schema store interactions that the hook drives,
 * and the exported createRefreshSchema utility in isolation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import type { DatabaseSchema } from "@/lib/schema-types";
import { useSchemaStore } from "@/stores/schema-store";
import { createRefreshSchema } from "@/hooks/use-schema";

const neo4jSchema: DatabaseSchema = {
  type: "neo4j",
  labels: ["Person"],
  relationshipTypes: ["KNOWS"],
  nodeProperties: {},
  relProperties: {},
};

const pgSchema: DatabaseSchema = {
  type: "postgresql",
  tables: [
    {
      name: "users",
      columns: [{ name: "id", type: "integer", nullable: false }],
    },
  ],
};

// ---------------------------------------------------------------------------
// Schema store contract used by useConnectionSchema
// ---------------------------------------------------------------------------

describe("schema store contract used by useConnectionSchema", () => {
  beforeEach(() => {
    useSchemaStore.setState({ schemas: {} });
  });

  it("schema written by hook is retrievable synchronously", () => {
    // Simulate what the queryFn does after a successful fetch
    useSchemaStore.getState().setSchema("conn-1", neo4jSchema);
    const stored = useSchemaStore.getState().getSchema("conn-1");
    expect(stored).toEqual(neo4jSchema);
    expect(stored?.type).toBe("neo4j");
  });

  it("clearSchema removes the entry — simulates refreshSchema side effect", () => {
    useSchemaStore.getState().setSchema("conn-1", neo4jSchema);
    useSchemaStore.getState().clearSchema("conn-1");
    expect(useSchemaStore.getState().getSchema("conn-1")).toBeUndefined();
  });

  it("multiple schemas can be stored independently", () => {
    useSchemaStore.getState().setSchema("neo4j-conn", neo4jSchema);
    useSchemaStore.getState().setSchema("pg-conn", pgSchema);
    expect(useSchemaStore.getState().getSchema("neo4j-conn")?.type).toBe("neo4j");
    expect(useSchemaStore.getState().getSchema("pg-conn")?.type).toBe("postgresql");
  });

  it("clearSchema only removes the targeted connection", () => {
    useSchemaStore.getState().setSchema("neo4j-conn", neo4jSchema);
    useSchemaStore.getState().setSchema("pg-conn", pgSchema);
    useSchemaStore.getState().clearSchema("neo4j-conn");
    expect(useSchemaStore.getState().getSchema("neo4j-conn")).toBeUndefined();
    expect(useSchemaStore.getState().getSchema("pg-conn")).toEqual(pgSchema);
  });
});

// ---------------------------------------------------------------------------
// Module exports
// ---------------------------------------------------------------------------

describe("use-schema module exports", () => {
  // Note: the hook uses queryKey ["connection-schema", connectionId].
  // The full query key contract is validated via createRefreshSchema tests below,
  // which call invalidateQueries with the same key pattern.
  it("exports useConnectionSchema as a function", async () => {
    const mod = await import("@/hooks/use-schema");
    expect(typeof mod.useConnectionSchema).toBe("function");
  });

  it("exports createRefreshSchema as a function", async () => {
    const mod = await import("@/hooks/use-schema");
    expect(typeof mod.createRefreshSchema).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// createRefreshSchema utility
// ---------------------------------------------------------------------------

describe("createRefreshSchema utility", () => {
  beforeEach(() => {
    useSchemaStore.setState({ schemas: {} });
  });

  /** Helper to create a minimal fake QueryClient with the methods refreshSchema uses. */
  function makeFakeQueryClient(
    overrides: Partial<{
      cancelQueries: () => Promise<void>;
      invalidateQueries: () => Promise<void>;
    }> = {},
  ) {
    return {
      cancelQueries: vi.fn().mockResolvedValue(undefined),
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    } as unknown as QueryClient;
  }

  it("returns a function when called with a QueryClient", () => {
    const mockQueryClient = makeFakeQueryClient();
    const refresh = createRefreshSchema(mockQueryClient);
    expect(typeof refresh).toBe("function");
  });

  it("calls cancelQueries then invalidateQueries with the correct queryKey", async () => {
    const fakeQueryClient = makeFakeQueryClient();
    const mockInvalidate = fakeQueryClient.invalidateQueries as ReturnType<typeof vi.fn>;

    const refresh = createRefreshSchema(fakeQueryClient);
    await refresh("conn-42");

    expect(fakeQueryClient.cancelQueries).toHaveBeenCalledWith({
      queryKey: ["connection-schema", "conn-42"],
    });
    expect(mockInvalidate).toHaveBeenCalledWith({
      queryKey: ["connection-schema", "conn-42"],
    });
  });

  it("clears the schema from the store", async () => {
    const fakeQueryClient = makeFakeQueryClient();

    const connectionId = "conn-42";
    useSchemaStore.getState().setSchema(connectionId, neo4jSchema);

    const refresh = createRefreshSchema(fakeQueryClient);
    await refresh(connectionId);

    expect(useSchemaStore.getState().getSchema(connectionId)).toBeUndefined();
  });

  it("performs both operations: clears store AND invalidates query", async () => {
    const fakeQueryClient = makeFakeQueryClient();
    const mockInvalidate = fakeQueryClient.invalidateQueries as ReturnType<typeof vi.fn>;

    const connectionId = "conn-42";
    useSchemaStore.getState().setSchema(connectionId, neo4jSchema);

    const refresh = createRefreshSchema(fakeQueryClient);
    await refresh(connectionId);

    expect(mockInvalidate).toHaveBeenCalledWith({
      queryKey: ["connection-schema", connectionId],
    });
    expect(useSchemaStore.getState().getSchema(connectionId)).toBeUndefined();
  });

  it("uses the connectionId from the call, not from the factory", async () => {
    const fakeQueryClient = makeFakeQueryClient();
    const mockInvalidate = fakeQueryClient.invalidateQueries as ReturnType<typeof vi.fn>;

    const refresh = createRefreshSchema(fakeQueryClient);
    await refresh("conn-abc");

    expect(mockInvalidate).toHaveBeenCalledWith({
      queryKey: ["connection-schema", "conn-abc"],
    });
  });

  it("clears only the targeted connection, not others", async () => {
    const fakeQueryClient = makeFakeQueryClient();

    useSchemaStore.getState().setSchema("conn-1", neo4jSchema);
    useSchemaStore.getState().setSchema("conn-2", pgSchema);

    const refresh = createRefreshSchema(fakeQueryClient);
    await refresh("conn-1");

    expect(useSchemaStore.getState().getSchema("conn-1")).toBeUndefined();
    expect(useSchemaStore.getState().getSchema("conn-2")).toEqual(pgSchema);
  });

  it("is safe to call when no cached schema exists for the connectionId", async () => {
    const fakeQueryClient = makeFakeQueryClient();
    const mockInvalidate = fakeQueryClient.invalidateQueries as ReturnType<typeof vi.fn>;

    // No schema set for conn-99 — should not throw
    const refresh = createRefreshSchema(fakeQueryClient);
    await expect(refresh("conn-99")).resolves.not.toThrow();
    expect(mockInvalidate).toHaveBeenCalledWith({
      queryKey: ["connection-schema", "conn-99"],
    });
  });

  it("uses the nested [connection-schema, id] key pattern", async () => {
    const fakeQueryClient = makeFakeQueryClient();
    const mockInvalidate = fakeQueryClient.invalidateQueries as ReturnType<typeof vi.fn>;

    const refresh = createRefreshSchema(fakeQueryClient);
    await refresh("test-id");

    const callArg = mockInvalidate.mock.calls[0][0] as { queryKey: unknown[] };
    expect(callArg.queryKey).toHaveLength(2);
    expect(callArg.queryKey[0]).toBe("connection-schema");
    expect(callArg.queryKey[1]).toBe("test-id");
  });
});
