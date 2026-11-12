import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useQueryExecution } from "../use-query-execution";

// #2445: a run started offline must not sit paused behind a Stop that has
// nothing to abort; it runs at once and fails like any other error.
describe("useQueryExecution offline", () => {
  afterEach(() => {
    onlineManager.setOnline(true);
    vi.restoreAllMocks();
  });

  it("does not pause a run started offline, so Stop never has nothing to abort", async () => {
    onlineManager.setOnline(false);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new TypeError("Failed to fetch"));
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useQueryExecution(), { wrapper });
    act(() => {
      result.current.mutate({ connectionId: "c1", query: "RETURN 1" });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.current.isPaused).toBe(false);
  });
});
