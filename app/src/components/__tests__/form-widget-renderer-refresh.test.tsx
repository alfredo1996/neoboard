/**
 * FormWidgetRenderer — "After Submit → refresh widgets" (#1799).
 *
 * The widget queries here are real useWidgetQuery observers in a real
 * QueryClient, so the assertion is against the key the hook actually builds —
 * not a hand-copied shape that could drift from it. They are disabled, so
 * nothing fetches; invalidation still marks the matched cache entries. So is
 * the parameter selector's seed query (a real useSeedQuery observer).
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

/* ---------- imports under test ---------- */
import { FormWidgetRenderer } from "../form-widget-renderer";
import { useWidgetQuery } from "@/hooks/use-widget-query";
import { useSeedQuery } from "@/hooks/use-seed-query";
import { useDashboardStore } from "@/stores/dashboard-store";
import { useParameterStore } from "@/stores/parameter-store";

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
// References a dashboard parameter, so the hook's key carries merged params
// that widget.params cannot match: the prefix must stop at `query`. No static
// params on purpose: `{limit: 5}` would still match `{limit: 5, param_region}`
// as a key subset and hide a prefix that runs past `query`.
const paramTarget: DashboardWidget = {
  id: "w-param-target",
  chartType: "table",
  connectionId: "conn-1",
  query: "MATCH (n:T) WHERE n.r = $param_region RETURN n",
};
// A dropdown listing what the form creates: its options are a seed query.
const selectTarget: DashboardWidget = {
  id: "w-select-target",
  chartType: "parameter-select",
  connectionId: "conn-1",
  query: "",
  settings: {
    parameterName: "who",
    parameterType: "select",
    seedQuery: "MATCH (n:T) RETURN n.name",
  },
};
const queryWidgets = [target, onOtherPage, bystander, paramTarget];
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
    { enabled: false, staleTime: widget === paramTarget ? 60_000 : undefined },
  );
  return null;
}

function SeedProbe({ widget }: Readonly<{ widget: DashboardWidget }>) {
  useSeedQuery(
    widget.connectionId,
    widget.settings?.seedQuery as string,
    false,
    { param_search: "" },
    "t1",
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
      {queryWidgets.map((w) => (
        <WidgetProbe key={w.id} widget={w} />
      ))}
      <SeedProbe widget={selectTarget} />
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

/**
 * Which widgets' cached queries are marked invalidated, by widget id. Any
 * other invalidated entry (the form's own field seed query, say) shows as "?".
 */
function invalidatedWidgets(): string[] {
  const byQuery = new Map(queryWidgets.map((w) => [w.query, w.id]));
  byQuery.set(selectTarget.settings?.seedQuery as string, selectTarget.id);
  return queryClient
    .getQueryCache()
    .getAll()
    .filter((q) => q.state.isInvalidated)
    .map((q) => {
      const [scope, , seedQuery, widgetQuery] = q.queryKey;
      const text = scope === "param-seed" ? seedQuery : widgetQuery;
      return byQuery.get(text as string) ?? "?";
    })
    .sort();
}

beforeEach(() => {
  mockMutate.mockReset();
  queryClient = new QueryClient();
  useParameterStore
    .getState()
    .setParameter("region", "EU", "test", "region", "text", "click-action");
  useDashboardStore.getState().setLayout({
    version: 2,
    pages: [
      {
        id: "p1",
        title: "One",
        widgets: [target, bystander, paramTarget, form],
        gridLayout: [],
      },
      {
        id: "p2",
        title: "Two",
        widgets: [onOtherPage, selectTarget],
        gridLayout: [],
      },
    ],
  });
});

afterEach(() => {
  queryClient.clear();
  useDashboardStore.getState().reset();
  useParameterStore.getState().clearAll();
});

describe("FormWidgetRenderer — refresh widgets after submit (#1799)", () => {
  it("invalidates exactly the configured widgets' queries, on any page", () => {
    mockMutate.mockImplementation((_p: unknown, opts: MutateOptions) =>
      opts.onSuccess(),
    );
    // "w-deleted" names a widget no longer on the dashboard: it is skipped.
    renderDashboard([
      "w-target",
      "w-other-page",
      "w-param-target",
      "w-select-target",
      "w-deleted",
    ]);
    expect(invalidatedWidgets()).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(mockMutate).toHaveBeenCalledTimes(1);
    // Without the parameter set, the param target's key would hold no merged
    // params and a prefix running past `query` could still match it.
    expect(
      queryClient
        .getQueryCache()
        .findAll({ queryKey: ["widget-query"] })
        .some(
          (q) =>
            (q.queryKey[4] as { param_region?: unknown } | undefined)
              ?.param_region === "EU",
        ),
    ).toBe(true);
    expect(invalidatedWidgets()).toEqual([
      "w-other-page",
      "w-param-target",
      "w-select-target",
      "w-target",
    ]);
  });

  // Marking a query stale is not a refresh: a mounted target must refetch now,
  // not on its next mount (`refetchType: "none"` would still pass the test above).
  it("refetches the mounted targets without a remount", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ data: { data: [] } }), {
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      mockMutate.mockImplementation((_p: unknown, opts: MutateOptions) =>
        opts.onSuccess(),
      );
      const queriesRun = (text: string) =>
        fetchMock.mock.calls.filter(
          ([, init]) =>
            (JSON.parse((init as RequestInit).body as string) as {
              query: string;
            }).query === text,
        ).length;
      function Mounted() {
        useWidgetQuery({ connectionId: "conn-1", query: paramTarget.query });
        useSeedQuery(
          "conn-1",
          selectTarget.settings?.seedQuery as string,
          true,
          undefined,
          "t1",
        );
        return null;
      }
      render(
        <QueryClientProvider client={queryClient}>
          <Mounted />
          <FormWidgetRenderer
            connectionId={form.connectionId}
            query={form.query}
            settings={{
              formFields: [
                {
                  id: "f-name",
                  label: "name",
                  parameterName: "name",
                  parameterType: "text",
                  required: false,
                } as FormFieldDef,
              ],
              chartOptions: {
                refreshWidgetIds: ["w-param-target", "w-select-target"],
              },
            }}
          />
        </QueryClientProvider>,
      );
      await vi.waitFor(() => {
        expect(queriesRun(paramTarget.query)).toBe(1);
        expect(queriesRun(selectTarget.settings?.seedQuery as string)).toBe(1);
        expect(queryClient.isFetching()).toBe(0);
      });

      fireEvent.click(screen.getByRole("button", { name: "Submit" }));

      await vi.waitFor(() => {
        expect(queriesRun(paramTarget.query)).toBe(2);
        expect(queriesRun(selectTarget.settings?.seedQuery as string)).toBe(2);
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("refreshes nothing when the submit fails", () => {
    mockMutate.mockImplementation((_p: unknown, opts: MutateOptions) =>
      opts.onError(new Error("boom")),
    );
    renderDashboard(["w-target", "w-param-target", "w-select-target"]);

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(invalidatedWidgets()).toEqual([]);
  });
});
