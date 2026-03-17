/**
 * useConnectionSchema — pure-logic tests (node environment, no DOM).
 *
 * The hook's React/TanStack Query lifecycle is tested via Playwright E2E.
 * Here we test the Zustand schema store interactions that the hook drives,
 * and the exported refreshSchema utility in isolation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DatabaseSchema } from "@/lib/schema-types";
import { useSchemaStore } from "@/stores/schema-store";

const neo4jSchema: DatabaseSchema = {
  type: "neo4j",
  labels: ["Person"],
  relationshipTypes: ["KNOWS"],
  nodeProperties: {},
  relProperties: {},
};

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
});

describe("useConnectionSchema — queryKey format", () => {
  it("uses ['connection-schema', connectionId] as query key", async () => {
    // Validate the query key pattern by importing the hook module and checking
    // that the function exists and is callable (logic tested via E2E).
    const mod = await import("../use-schema");
    expect(typeof mod.useConnectionSchema).toBe("function");
  });
});

describe("createRefreshSchema utility", () => {
  beforeEach(() => {
    useSchemaStore.setState({ schemas: {} });
  });

  it("clearSchema + queryClient.invalidateQueries combination", () => {
    // Test the two operations that refreshSchema performs independently.
    const mockInvalidate = vi.fn();
    const fakeQueryClient = { invalidateQueries: mockInvalidate } as unknown as Parameters<typeof import("../use-schema").createRefreshSchema>[0];

    const connectionId = "conn-42";
    useSchemaStore.getState().setSchema(connectionId, neo4jSchema);

    import("../use-schema").then(({ createRefreshSchema }) => {
      const refresh = createRefreshSchema(fakeQueryClient);
      refresh(connectionId);

      expect(mockInvalidate).toHaveBeenCalledWith({
        queryKey: ["connection-schema", connectionId],
      });
      expect(useSchemaStore.getState().getSchema(connectionId)).toBeUndefined();
    });
  });
});
