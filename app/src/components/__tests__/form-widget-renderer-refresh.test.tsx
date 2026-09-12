/**
 * FormWidgetRenderer — "After Submit → refresh widgets" (#1799).
 *
 * The widget queries here are real useWidgetQuery observers in a real
 * QueryClient, so the assertion is against the key the hook actually builds —
 * not a hand-copied shape that could drift from it. They are disabled, so
 * nothing fetches; invalidation still marks the matched cache entries.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { FormFieldDef } from "@/lib/widget/form-field-def";
import type { DashboardWidget } from "@/lib/db/schema";

/* ---------- mocks (declared before imports) ---------- */

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { role: "admin", canWrite: true, tenantId: "t1" } },
  }),
}));

// TextInputParameter is what the real DebouncedTextInput renders.
vi.mock("@neoboard/components", () => ({
  TextInputParameter: ({
    parameterName,
    value,
    onChange,
    id,
  }: {
    parameterName: string;
    value: string;
    onChange: (v: string) => void;
    id?: string;
  }) => (
    <input
      id={id}
      type="text"
      data-testid={`input-${parameterName}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
  Button: ({
    children,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...rest}>{children}</button>
  ),
  Label: ({
    children,
    htmlFor,
  }: {
    children: React.ReactNode;
    htmlFor?: string;
  }) => <label htmlFor={htmlFor}>{children}</label>,
}));

type MutateOptions = { onSuccess: () => void; onError: (e: Error) => void };
const mockMutate = vi.fn();
vi.mock("@/hooks/use-write-query-execution", () => ({
  useWriteQueryExecution: () => ({ mutate: mockMutate, isPending: false }),
}));

vi.mock("@/hooks/use-seed-query", () => ({
  useSeedQuery: () => ({ options: [], loading: false }),
}));

/* ---------- imports under test ---------- */
import { FormWidgetRenderer } from "../form-widget-renderer";
import { useWidgetQuery } from "@/hooks/use-widget-query";
import { useDashboardStore } from "@/stores/dashboard-store";

const target: DashboardWidget = {
  id: "w-target",
  chartType: "single-value",
  connectionId: "conn-1",
  query: "MATCH (n:Target) RETURN count(n)",
  params: { limit: 5 },
};
const onOtherPage: DashboardWidget = {
  id: "w-other-page",
  chartType: "single-value",
  connectionId: "conn-2",
  database: "movies",
  query: "MATCH (m:Movie) RETURN count(m)",
};
const bystander: DashboardWidget = {
  id: "w-bystander",
  chartType: "single-value",
  connectionId: "conn-1",
  query: "MATCH (n:Bystander) RETURN count(n)",
};
const form: DashboardWidget = {
  id: "w-form",
  chartType: "form",
  connectionId: "conn-1",
  query: "CREATE (n:Target {name: $param_name})",
};

function WidgetProbe({ widget }: Readonly<{ widget: DashboardWidget }>) {
  useWidgetQuery(
    {
      connectionId: widget.connectionId,
      query: widget.query,
      params: widget.params,
      database: widget.database,
    },
    { enabled: false },
  );
  return null;
}

let queryClient: QueryClient;

function renderDashboard(refreshWidgetIds: string[]) {
  const nameField = {
    id: "f-name",
    label: "name",
    parameterName: "name",
    parameterType: "text",
    required: false,
  } as FormFieldDef;
  render(
    <QueryClientProvider client={queryClient}>
      {[target, onOtherPage, bystander].map((w) => (
        <WidgetProbe key={w.id} widget={w} />
      ))}
      <FormWidgetRenderer
        connectionId={form.connectionId}
        query={form.query}
        settings={{
          formFields: [nameField],
          chartOptions: { refreshWidgetIds },
        }}
      />
    </QueryClientProvider>,
  );
}

/** Which widgets' cached queries are marked invalidated, by widget id. */
function invalidatedWidgets(): string[] {
  const byQuery = new Map(
    [target, onOtherPage, bystander].map((w) => [w.query, w.id]),
  );
  return queryClient
    .getQueryCache()
    .findAll({ queryKey: ["widget-query"] })
    .filter((q) => q.state.isInvalidated)
    .map((q) => byQuery.get(q.queryKey[3] as string) ?? "?")
    .sort();
}

beforeEach(() => {
  mockMutate.mockReset();
  queryClient = new QueryClient();
  useDashboardStore.getState().setLayout({
    version: 2,
    pages: [
      {
        id: "p1",
        title: "One",
        widgets: [target, bystander, form],
        gridLayout: [],
      },
      { id: "p2", title: "Two", widgets: [onOtherPage], gridLayout: [] },
    ],
  });
});

afterEach(() => {
  queryClient.clear();
  useDashboardStore.getState().reset();
});

describe("FormWidgetRenderer — refresh widgets after submit (#1799)", () => {
  it("invalidates exactly the configured widgets' queries, on any page", () => {
    mockMutate.mockImplementation((_p: unknown, opts: MutateOptions) =>
      opts.onSuccess(),
    );
    // "w-deleted" names a widget no longer on the dashboard: it is skipped.
    renderDashboard(["w-target", "w-other-page", "w-deleted"]);
    expect(invalidatedWidgets()).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(invalidatedWidgets()).toEqual(["w-other-page", "w-target"]);
  });

  it("refreshes nothing when the submit fails", () => {
    mockMutate.mockImplementation((_p: unknown, opts: MutateOptions) =>
      opts.onError(new Error("boom")),
    );
    renderDashboard(["w-target"]);

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(invalidatedWidgets()).toEqual([]);
  });
});
