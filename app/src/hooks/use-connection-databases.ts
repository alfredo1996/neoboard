import { useQuery } from "@tanstack/react-query";
import { unwrapResponse } from "@/lib/api/api-client";

interface DatabaseListResult {
  databases: string[];
  schemas?: string[];
}

/**
 * Fetches the list of databases (and schemas for PG) for a saved connection.
 * Only runs when connectionId is provided and enabled is true.
 */
export function useConnectionDatabases(
  connectionId: string | undefined,
  enabled = true,
) {
  return useQuery<DatabaseListResult>({
    queryKey: ["connection-databases", connectionId],
    queryFn: async () => {
      const res = await fetch(`/api/connections/${connectionId}/databases`);
      return unwrapResponse<DatabaseListResult>(res);
    },
    enabled: !!connectionId && enabled,
    staleTime: 60_000, // Cache for 1 minute
  });
}
