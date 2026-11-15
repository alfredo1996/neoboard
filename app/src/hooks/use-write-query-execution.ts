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

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

export function useWriteQueryExecution() {
  return useMutation<WriteQueryResult, Error, WriteQueryInput>({
    mutationFn: async (input) => {
      const res = await fetch("/api/query/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // A saved form runs the text it saves; the page names the text it
        // shows by hash, so a long query stays under a proxy's body cap and a
        // stale page is refused (#2486).
        body: JSON.stringify(
          input.widgetId && input.dashboardId
            ? {
                ...input,
                query: undefined,
                queryHash: await sha256Hex(input.query),
              }
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
