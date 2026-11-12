/**
 * Stop during a run-and-save (#2445). Real QueryClient: the bug lived in how
 * the mutation observer treats a stop, which a mocked useMutation cannot show.
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useQueryExecution } from "@/hooks/use-query-execution";
import { useAutoPreview } from "../use-auto-preview";
import type { DashboardWidget } from "@/lib/db/schema";

function setup() {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
    (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason),
        );
      }),
  );
  const onSave = vi.fn();
  const client = new QueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    () => {
      const previewQuery = useQueryExecution();
      const auto = useAutoPreview({
        open: true,
        mode: "edit",
        connectionId: "c1",
        query: "RETURN 1",
        chartType: "table",
        allParamValues: {},
        initialPreviewData: { data: [], resultId: "r0" },
        previewQuery,
        buildWidgetForSave: () => ({}) as DashboardWidget,
        onSave,
        onOpenChange: vi.fn(),
      });
      return { previewQuery, auto };
    },
    { wrapper },
  );
  return { fetchMock, onSave, ...hook };
}

const runAndSave = () =>
  document.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Enter",
      metaKey: true,
      shiftKey: true,
    }),
  );

describe("Stop during run-and-save (#2445)", () => {
  it("settles the save and lets the next Run go out", async () => {
    const { result, fetchMock, onSave } = setup();
    act(() => runAndSave());
    await waitFor(() => expect(result.current.auto.saveStatus).toBe("saving"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    act(() => result.current.previewQuery.stop());

    await waitFor(() => expect(result.current.auto.saveStatus).toBe("idle"));
    expect(onSave).not.toHaveBeenCalled();
    // A stop is not a failure: the preview says stopped, not "Query failed".
    expect(result.current.previewQuery.isStopped).toBe(true);
    expect(result.current.previewQuery.isError).toBe(false);

    act(() => result.current.auto.handlePreview());
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(1));
  });
});
