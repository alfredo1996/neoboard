/**
 * Expanding a widget whose tile already rendered (#1509). A real
 * DashboardContainer and CardContainer over a real query cache: the expanded
 * copy must open on the cached rows at once, never on a skeleton or spinner.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DashboardContainer } from "../dashboard-container";
import type { DashboardPage } from "@/lib/db/schema";

vi.mock("next/dynamic", () => ({
  default: () =>
    function DynamicStub() {
      return <div data-testid="dynamic-stub" />;
    },
}));
vi.mock("@/components/chart-renderer", () => ({
  ChartRenderer: () => <div data-testid="chart-renderer" />,
}));

const page = {
  id: "page-1",
  title: "P",
  widgets: [
    {
      id: "w-1",
      chartType: "bar",
      connectionId: "conn-1",
      query: "select 1",
      settings: { title: "Expand me", cacheTtlMinutes: 5 },
    },
  ],
  gridLayout: [{ i: "w-1", x: 0, y: 0, w: 12, h: 2 }],
} as unknown as DashboardPage;

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        data: { data: [{ a: 1 }], fields: ["a"], resultId: "r1" },
      }),
    ),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("expanding a rendered widget (#1509)", () => {
  it("opens on the cached rows with no loading state in the dialog", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <DashboardContainer page={page} />
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(screen.getAllByTestId("chart-renderer")).toHaveLength(1),
    );

    act(() => {
      fireEvent.click(screen.getByLabelText("Fullscreen"));
    });

    const dialog = await screen.findByRole("dialog");
    expect(
      dialog.querySelector("[data-testid='chart-renderer']"),
    ).not.toBeNull();
    expect(dialog.querySelector(".animate-spin")).toBeNull();
    expect(dialog.querySelector("[data-testid='skeleton']")).toBeNull();
  });
});
