/**
 * #1742 — a new search term used to put the seed query back into its initial
 * loading state. Both selectors swap the whole popover for a skeleton while
 * `loading`, which unmounted the search input and wiped what the user typed.
 *
 * Kept apart from use-seed-query.test.ts, which mocks TanStack Query: what is
 * under test here is TanStack's behaviour, so it needs a real QueryClient.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSeedQuery } from "../use-seed-query";

const KEANU = { value: "keanu", label: "Keanu Reeves", rawValue: "keanu" };

describe("useSeedQuery — a new search term keeps the options on screen (#1742)", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient();
    // The first request answers; every later one stays in flight, so the
    // assertions look at the hook mid-refetch.
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: [{ value: "keanu", label: "Keanu Reeves" }] }),
        ),
      )
      .mockImplementation(() => new Promise<Response>(() => {}));
  });

  afterEach(() => {
    queryClient.clear();
    vi.restoreAllMocks();
  });

  function renderSeedQuery(extraParams: Record<string, unknown>) {
    return renderHook(
      (props: { extraParams: Record<string, unknown> }) =>
        useSeedQuery("conn-1", "RETURN 1", true, props.extraParams, "tenant-1"),
      {
        initialProps: { extraParams },
        wrapper: ({ children }) =>
          React.createElement(
            QueryClientProvider,
            { client: queryClient },
            children,
          ),
      },
    );
  }

  it("keeps the previous options, not loading, while only the search term refetches", async () => {
    const { result, rerender } = renderSeedQuery({ param_country: "US" });
    await waitFor(() => expect(result.current.options).toEqual([KEANU]));

    rerender({ extraParams: { param_country: "US", param_search: "Kea" } });

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
    expect(result.current.loading).toBe(false);
    expect(result.current.options).toEqual([KEANU]);
  });

  it("drops the previous options when the parent changes, even under the same term (#1360)", async () => {
    // The form widget resets the term in an effect, so for one render the new
    // parent really does travel with the old term.
    const { result, rerender } = renderSeedQuery({
      param_country: "US",
      param_search: "Kea",
    });
    await waitFor(() => expect(result.current.options).toEqual([KEANU]));

    rerender({ extraParams: { param_country: "FR", param_search: "Kea" } });

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
    expect(result.current.loading).toBe(true);
    expect(result.current.options).toEqual([]);
  });
});
