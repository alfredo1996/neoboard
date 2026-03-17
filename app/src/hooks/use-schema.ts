"use client";

import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { unwrapResponse } from "@/lib/api-client";
import { useSchemaStore } from "@/stores/schema-store";
import type { DatabaseSchema } from "@/lib/schema-types";

/**
 * Returns a refresh function for a given connectionId.
 * Exported separately so it can be tested in isolation (node environment).
 */
export function createRefreshSchema(queryClient: QueryClient) {
  return function refreshSchema(connectionId: string) {
    useSchemaStore.getState().clearSchema(connectionId);
    queryClient.invalidateQueries({
      queryKey: ["connection-schema", connectionId],
    });
  };
}

/**
 * Fetches and caches the schema for a database connection.
 *
 * - Skips the request when connectionId is null/undefined.
 * - Results are cached for 10 minutes via React Query staleTime.
 * - The fetched schema is also written to the Zustand schema store
 *   so it can be accessed synchronously by other parts of the app.
 * - Returns a `refreshSchema()` helper that invalidates the cache
 *   and clears the Zustand entry, forcing a re-fetch.
 */
export function useConnectionSchema(connectionId: string | null | undefined) {
  const setSchema = useSchemaStore((s) => s.setSchema);
  const queryClient = useQueryClient();

  const query = useQuery<DatabaseSchema>({
    queryKey: ["connection-schema", connectionId],
    queryFn: async () => {
      const r = await fetch(`/api/connections/${connectionId}/schema`);
      const schema = await unwrapResponse<DatabaseSchema>(r);
      setSchema(connectionId!, schema);
      return schema;
    },
    enabled: !!connectionId,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const refreshSchema = connectionId
    ? createRefreshSchema(queryClient).bind(null, connectionId)
    : () => {};

  return { ...query, refreshSchema };
}
