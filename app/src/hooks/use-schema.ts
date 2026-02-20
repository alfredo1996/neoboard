"use client";

import { useQuery } from "@tanstack/react-query";
import { useSchemaStore } from "@/stores/schema-store";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DatabaseSchema = Record<string, any>;

/**
 * Fetches and caches the schema for a database connection.
 *
 * - Skips the request when connectionId is null/undefined.
 * - Results are cached for 10 minutes via React Query staleTime.
 * - The fetched schema is also written to the Zustand schema store
 *   so it can be accessed synchronously by other parts of the app.
 */
export function useConnectionSchema(connectionId: string | null | undefined) {
  const setSchema = useSchemaStore((s) => s.setSchema);

  return useQuery<DatabaseSchema>({
    queryKey: ["connection-schema", connectionId],
    queryFn: async () => {
      const r = await fetch(`/api/connections/${connectionId}/schema`);
      if (!r.ok) throw new Error(await r.text());
      const schema: DatabaseSchema = await r.json();
      setSchema(connectionId!, schema);
      return schema;
    },
    enabled: !!connectionId,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}
