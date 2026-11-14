/**
 * A saved, unchanged widget asks for its query by reference (#2477), so the
 * request body stays under a proxy's few-KB cap whatever the query's length.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useWidgetQuery } from "../use-widget-query";
import { useSeedQuery } from "../use-seed-query";
import { useSavedQueryRef } from "../use-saved-query-ref";
import { useDashboardStore } from "@/stores/dashboard-store";
import type { DashboardLayoutV2, DashboardWidget } from "@/lib/db/schema";

let mockDashboardId: string | undefined = "d1";
vi.mock("next/navigation", () => ({
  useParams: () => (mockDashboardId ? { id: mockDashboardId } : {}),
}));

const BIG = "/* " + "x".repeat(12_000) + " */ MATCH (n) RETURN n";

function widget(over: Partial<DashboardWidget> = {}): DashboardWidget {
  return {
    id: "w1",
    chartType: "table",
    connectionId: "c1",
    query: BIG,
    params: {},
    settings: {},
    ...over,
  } as DashboardWidget;
}
function layout(...widgets: DashboardWidget[]): DashboardLayoutV2 {
  return {
    version: 2,
    pages: [{ id: "p1", title: "P", widgets, gridLayout: [] }],
  } as unknown as DashboardLayoutV2;
}

let queryClient: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function stubFetch() {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(
      async () =>
        new Response(JSON.stringify({ data: { data: [] }, meta: {} })),
    );
}
const sentBody = (f: ReturnType<typeof stubFetch>) =>
  String((f.mock.calls[0][1] as RequestInit).body);

beforeEach(() => {
  queryClient = new QueryClient();
  mockDashboardId = "d1";
  useDashboardStore.getState().setLayout(layout(widget()));
});
afterEach(() => {
  vi.restoreAllMocks();
  queryClient.clear();
});

describe("useSavedQueryRef", () => {
  const ref = (current: Partial<DashboardWidget> = {}) =>
    renderHook(
      () =>
        useSavedQueryRef("w1", {
          connectionId: "c1",
          database: undefined,
          query: BIG,
          ...current,
        }),
      { wrapper },
    ).result.current;

  it("names the widget when it matches the saved layout", () => {
    expect(ref()).toEqual({ dashboardId: "d1", widgetId: "w1" });
  });

  it.each([
    ["its query is edited", { query: BIG + " LIMIT 1" }],
    ["its connection is changed", { connectionId: "c2" }],
    ["its database is changed", { database: "other" }],
  ])("sends text when %s", (_n, current) => {
    expect(ref(current)).toBeUndefined();
  });

  it("sends text for a widget the saved layout does not hold", () => {
    useDashboardStore.getState().setLayout(layout());
    expect(ref()).toBeUndefined();
  });

  it("is not made dirty by another widget's edit", () => {
    useDashboardStore
      .getState()
      .setLayout(layout(widget(), widget({ id: "w2" })));
    useDashboardStore.getState().updateWidget("w2", { query: "other" });
    expect(ref()).toEqual({ dashboardId: "d1", widgetId: "w1" });
  });

  it("sends text outside a dashboard page", () => {
    mockDashboardId = undefined;
    expect(ref()).toBeUndefined();
  });

  it("names a seed by its field when the saved field holds the same text", () => {
    useDashboardStore.getState().setLayout(
      layout(
        widget({
          chartType: "form",
          query: "",
          settings: { formFields: [{ id: "f1", seedQuery: "SEED" }] },
        }),
      ),
    );
    const { result } = renderHook(
      () =>
        useSavedQueryRef(
          "w1",
          { connectionId: "c1", query: "SEED" },
          { fieldId: "f1" },
        ),
      { wrapper },
    );
    expect(result.current).toEqual({
      dashboardId: "d1",
      widgetId: "w1",
      seed: { fieldId: "f1" },
    });
  });
});

describe("useWidgetQuery with a reference", () => {
  it("sends no query text, and under 1 KB, for a 12 KB saved query", async () => {
    const f = stubFetch();
    renderHook(
      () =>
        useWidgetQuery({
          connectionId: "c1",
          query: BIG,
          savedRef: { dashboardId: "d1", widgetId: "w1" },
        }),
      { wrapper },
    );
    await waitFor(() => expect(f).toHaveBeenCalledTimes(1));
    const body = sentBody(f);
    expect(body.length).toBeLessThan(1024);
    expect(JSON.parse(body)).toEqual({
      connectionId: "c1",
      ref: { dashboardId: "d1", widgetId: "w1" },
    });
  });

  it("sends the text when there is no reference", async () => {
    const f = stubFetch();
    renderHook(() => useWidgetQuery({ connectionId: "c1", query: BIG }), {
      wrapper,
    });
    await waitFor(() => expect(f).toHaveBeenCalledTimes(1));
    expect(JSON.parse(sentBody(f)).query).toBe(BIG);
  });
});

describe("useSeedQuery with a reference", () => {
  it("sends the reference and no query text", async () => {
    const f = stubFetch();
    renderHook(
      () =>
        useSeedQuery("c1", BIG, true, { param_search: "a" }, "t1", undefined, {
          dashboardId: "d1",
          widgetId: "w1",
          seed: {},
        }),
      { wrapper },
    );
    await waitFor(() => expect(f).toHaveBeenCalledTimes(1));
    expect(JSON.parse(sentBody(f))).toEqual({
      connectionId: "c1",
      ref: { dashboardId: "d1", widgetId: "w1", seed: {} },
      params: { param_search: "a" },
      tenantId: "t1",
    });
  });
});
