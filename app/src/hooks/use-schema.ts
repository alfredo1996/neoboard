"use client";

import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { unwrapResponse } from "@/lib/api/api-client";
import { clearRefresh, markRefresh, peekRefresh } from "@/hooks/refresh-flag";
import { useSchemaStore } from "@/stores/schema-store";
import type { DatabaseSchema } from "@neoboard/connection";

/**
 * Returns a refresh function for a given connectionId.
 * Exported separately so it can be tested in isolation (node environment).
 *
 * Cancels any in-flight query before invalidating the cache to prevent a
 * late-arriving response from repopulating the store with stale schema.
 */
export function createRefreshSchema(queryClient: QueryClient) {
  return async function refreshSchema(connectionId: string) {
    await queryClient.cancelQueries({
      queryKey: ["connection-schema", connectionId],
    });
    useSchemaStore.getState().clearSchema(connectionId);
    markRefresh(
      queryClient,
      ["connection-schema", connectionId],
      `schema:${connectionId}`,
    );
    return queryClient.invalidateQueries({
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
    queryFn: async ({ signal }) => {
      const flag = `schema:${connectionId}`;
      const r = await fetch(
        `/api/connections/${connectionId}/schema${peekRefresh(flag)}`,
        { signal },
      );
      const schema = await unwrapResponse<DatabaseSchema>(r);
      clearRefresh(flag);
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
