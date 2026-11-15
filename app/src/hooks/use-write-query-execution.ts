"use client";

import { useMutation } from "@tanstack/react-query";
import { unwrapFullResponse } from "@/lib/api/api-client";

interface WriteQueryInput {
  connectionId: string;
  query: string;
  params?: Record<string, unknown>;
  /** The stored widget and its dashboard: the route writes on the database
   *  that stored widget saves (#1824). */
  widgetId?: string;
  dashboardId?: string;
}

interface WriteQueryResult {
  data: unknown;
  serverDurationMs: number;
}

export function useWriteQueryExecution() {
  return useMutation<WriteQueryResult, Error, WriteQueryInput>({
    mutationFn: async (input) => {
      const res = await fetch("/api/query/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // A saved form runs the text it saves; sending it too would put a
        // long query over a proxy's body cap (#2486).
        body: JSON.stringify(
          input.widgetId && input.dashboardId
            ? { ...input, query: undefined }
            : input,
        ),
      });
      const { data, meta } = await unwrapFullResponse(res);
      const metaObj = (meta as Record<string, unknown>) ?? {};
      return {
        data,
        ...metaObj,
      } as WriteQueryResult;
    },
  });
}
