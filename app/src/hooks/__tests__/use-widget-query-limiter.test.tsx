/**
 * The cards' requests go through the one /api/query limiter with TanStack's
 * abort signal, so leaving a dashboard drops the queued ones (#2443).
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const limitedFetch = vi.fn();
vi.mock("@/lib/query/limited-fetch", () => ({
  limitedFetch: (...a: unknown[]) => limitedFetch(...a),
}));

import { useWidgetQuery } from "../use-widget-query";

describe("useWidgetQuery request path", () => {
  it("sends through limitedFetch with an AbortSignal", async () => {
    limitedFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: () =>
        Promise.resolve({
          data: { data: [] },
          error: null,
          meta: { resultId: "r" },
        }),
    });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={new QueryClient()}>
        {children}
      </QueryClientProvider>
    );
    renderHook(
      () => useWidgetQuery({ connectionId: "c1", query: "SELECT 1" }),
      {
        wrapper,
      },
    );
    await waitFor(() => expect(limitedFetch).toHaveBeenCalledTimes(1));
    const [url, init] = limitedFetch.mock.calls[0];
    expect(url).toBe("/api/query");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
