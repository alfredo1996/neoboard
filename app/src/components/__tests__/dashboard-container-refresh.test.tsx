/**
 * DashboardContainer — manual refresh button (issue #779).
 *
 * Regression test for the queryKey-mismatch bug where the per-widget refresh
 * button silently no-op'd because it invalidated a 4-element key while
 * useWidgetQuery actually cached a 5-element key — the extra `staleTime`
 * slot blocked prefix matching, and `widget.params` (raw) did not equal
 * the hook's `mergedParams` (resolved with dashboard parameters).
 *
 * The fix truncates the invalidation prefix to 3 elements
 * (["widget-query", connectionId, query]) so TanStack Query prefix-matches
 * all variants regardless of params/staleTime.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DashboardPage, DashboardWidget } from "@/lib/db/schema";

// ── Mocks ──────────────────────────────────────────────────────────────

vi.mock("@neoboard/components", () => ({
  WidgetCard: ({
    children,
    title,
    onRefresh,
  }: {
    children: React.ReactNode;
    title: string;
    onRefresh?: () => void;
  }) => (
    <div data-testid="widget-card-inner" data-title={title}>
      {onRefresh && (
        <button data-testid="refresh-button" onClick={onRefresh}>
          refresh
        </button>
      )}
      {children}
    </div>
  ),
  EmptyState: ({ title }: { title: string }) => (
    <div data-testid="empty-state">{title}</div>
  ),
  DashboardGrid: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dashboard-grid">{children}</div>
  ),
  Dialog: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Button: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <button {...props}>{children}</button>
  ),
  ParameterBar: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CrossFilterTag: () => <div />,
  AlertDialog: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogAction: ({ children }: { children: React.ReactNode }) => (
    <button>{children}</button>
  ),
  AlertDialogCancel: ({ children }: { children: React.ReactNode }) => (
    <button>{children}</button>
  ),
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  buildCsvString: () => "",
  triggerDownload: vi.fn(),
  buildExportFilename: () => "export.csv",
}));

vi.mock("@/components/card-container", () => ({
  CardContainer: () => <div data-testid="card-container" />,
}));

vi.mock("@/lib/widget/interpolate-title", () => ({
  interpolateTitle: (title: string) => title,
}));

vi.mock("@/lib/widget/card-utils", () => ({
  buildExportData: () => [],
}));

vi.mock("@/lib/widget/widget-utils", () => ({
  getWidgetDisplayTitle: (w: DashboardWidget) =>
    (w.settings?.title as string) || w.chartType,
  isWidgetTemplateOutdated: () => false,
}));

vi.mock("@/lib/widget/widget-actions", () => ({
  isDataWidget: () => true,
}));

vi.mock("@/stores/parameter-store", () => ({
  useParameterStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({
      parameters: {},
      clearParameter: vi.fn(),
      clearAll: vi.fn(),
    }),
  useParameterValues: () => ({}),
}));

vi.mock("@/lib/parameter/format-parameter-value", () => ({
  formatParameterValue: (v: unknown) => String(v),
  filterParentParams: (entries: [string, unknown][]) => entries,
}));

vi.mock("@/lib/query/resolve-cache-options", () => ({
  // Show the refresh button so the WidgetCard mock renders it.
  shouldShowRefreshButton: () => true,
}));

const { DashboardContainer } = await import("../dashboard-container");

// ── Helpers ────────────────────────────────────────────────────────────

function makeWidget(overrides: Partial<DashboardWidget> = {}): DashboardWidget {
  return {
    id: "w-1",
    chartType: "bar",
    connectionId: "conn-1",
    query: "MATCH (n) RETURN n",
    settings: { title: "Test Widget" },
    ...overrides,
  };
}

function makePage(widgets: DashboardWidget[] = [makeWidget()]): DashboardPage {
  return {
    id: "page-1",
    title: "Test Page",
    widgets,
    gridLayout: widgets.map((w, i) => ({
      i: w.id,
      x: 0,
      y: i * 2,
      w: 12,
      h: 2,
    })),
  };
}

describe("DashboardContainer — manual refresh button (#779)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invalidates the cached widget-query entry when refresh is clicked", async () => {
    const user = userEvent.setup();
    const widget = makeWidget({
      connectionId: "conn-1",
      query: "MATCH (n) RETURN n",
      // Raw widget.params — different identity from what useWidgetQuery
      // would compute as `mergedParams` at hook call time.
      params: { foo: "{{dashParam}}" } as unknown as DashboardWidget["params"],
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    // Seed the cache under the SAME shape useWidgetQuery uses:
    //   ["widget-query", connectionId, query, mergedParams, staleTime]
    // `mergedParams` is resolved (object identity differs from widget.params)
    // and `staleTime` is a 5th slot.
    const cachedKey = [
      "widget-query",
      "conn-1",
      "MATCH (n) RETURN n",
      { foo: "resolved" },
      0,
    ];
    queryClient.setQueryData(cachedKey, { data: [{ n: 1 }] });

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    render(
      <QueryClientProvider client={queryClient}>
        <DashboardContainer page={makePage([widget])} editable={false} />
      </QueryClientProvider>,
    );

    await user.click(screen.getByTestId("refresh-button"));

    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    const passedKey = invalidateSpy.mock.calls[0][0]?.queryKey as unknown[];

    // The invalidation key must be a *prefix* of the cached key so
    // TanStack Query's prefix matching catches the cached entry.
    // (TanStack matches when invalidationKey === cachedKey.slice(0, n).)
    expect(cachedKey.slice(0, passedKey.length)).toEqual(passedKey);

    // And the cached entry must actually be marked invalidated.
    const state = queryClient.getQueryState(cachedKey);
    expect(state?.isInvalidated).toBe(true);
  });

  it("scopes invalidation to the clicked widget's connection + query", async () => {
    const user = userEvent.setup();
    const widgetA = makeWidget({
      id: "w-a",
      connectionId: "conn-A",
      query: "MATCH (a) RETURN a",
      settings: { title: "Widget A" },
    });
    const widgetB = makeWidget({
      id: "w-b",
      connectionId: "conn-B",
      query: "MATCH (b) RETURN b",
      settings: { title: "Widget B" },
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const keyA = ["widget-query", "conn-A", "MATCH (a) RETURN a", {}, 0];
    const keyB = ["widget-query", "conn-B", "MATCH (b) RETURN b", {}, 0];
    queryClient.setQueryData(keyA, { data: [] });
    queryClient.setQueryData(keyB, { data: [] });

    render(
      <QueryClientProvider client={queryClient}>
        <DashboardContainer
          page={makePage([widgetA, widgetB])}
          editable={false}
        />
      </QueryClientProvider>,
    );

    const refreshButtons = screen.getAllByTestId("refresh-button");
    expect(refreshButtons).toHaveLength(2);

    // Click only widget A's refresh.
    await user.click(refreshButtons[0]);

    expect(queryClient.getQueryState(keyA)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(keyB)?.isInvalidated).toBe(false);
  });
});
