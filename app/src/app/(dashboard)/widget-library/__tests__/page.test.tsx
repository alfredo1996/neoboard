import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

/**
 * #1899 — the widget library reads connector facts from the descriptor list
 * (`useConnectors`), not from a map of the connectors somebody knew about. The
 * fixture connector below exists nowhere else in the repo.
 */

const connectors = [
  { type: "acme-sheets", label: "Acme Sheets", queryLanguage: "acmeql" },
  { type: "acme-graph", label: "Acme Graph" },
];

const BASE_TEMPLATES = [
  {
    id: "t1",
    name: "Budget rows",
    chartType: "table",
    connectorType: "acme-sheets",
    query: "SHEET budget",
    tags: [],
  },
  {
    id: "t2",
    name: "Orphaned",
    chartType: "table",
    connectorType: "uninstalled",
    query: "whatever this was",
    tags: [],
  },
];

let templates: (typeof BASE_TEMPLATES)[number][] = BASE_TEMPLATES;

vi.mock("@/hooks/use-connectors", () => ({
  useConnectors: () => ({ data: connectors }),
}));
vi.mock("@/hooks/use-connections", () => ({
  useConnections: () => ({ data: [] }),
}));
vi.mock("@/hooks/use-widget-templates", () => {
  const idle = () => ({ mutate: vi.fn(), mutateAsync: vi.fn() });
  return {
    useWidgetTemplates: () => ({ data: templates, isLoading: false }),
    useDeleteWidgetTemplate: idle,
    useCreateWidgetTemplate: () => ({
      mutate: mockCreate,
      mutateAsync: vi.fn(),
    }),
  };
});
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "u1", role: "creator" } } }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/plugin/chart-helpers", () => ({
  getChartConfig: (type: string) => ({ label: type }),
}));
vi.mock("@/components/widget-editor-modal", () => ({
  WidgetEditorModal: () => null,
}));
vi.mock("@/components/dashboard-picker-dialog", () => ({
  DashboardPickerDialog: () => null,
}));

vi.mock("@neoboard/components", () => {
  const Box = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  return {
    PageHeader: Box,
    EmptyState: Box,
    LoadingOverlay: Box,
    Badge: Box,
    // Only the two props the page's own row actions need — forwarding the rest
    // would put `variant` and `size` on a DOM button.
    Button: ({
      children,
      onClick,
      "aria-label": label,
    }: {
      children?: React.ReactNode;
      onClick?: () => void;
      "aria-label"?: string;
    }) => (
      <button onClick={onClick} aria-label={label}>
        {children}
      </button>
    ),
    Input: () => null,
    ConfirmDialog: () => null,
    Tooltip: Box,
    TooltipTrigger: Box,
    TooltipContent: () => null,
    Select: Box,
    SelectTrigger: ({ children }: { children?: React.ReactNode }) => (
      <div data-testid="select-trigger">{children}</div>
    ),
    SelectValue: ({ placeholder }: { placeholder: string }) => (
      <span>{placeholder}</span>
    ),
    SelectContent: Box,
    SelectItem: ({
      value,
      children,
    }: {
      value: string;
      children?: React.ReactNode;
    }) => <option value={value}>{children}</option>,
    CodePreview: ({ value, language }: { value: string; language: string }) => (
      <pre data-language={language}>{value}</pre>
    ),
    useToast: () => ({ toast: vi.fn() }),
  };
});

import WidgetLibraryPage from "../page";

beforeEach(() => {
  templates = BASE_TEMPLATES;
  mockCreate.mockClear();
});

/**
 * #1900: `connectorType` is nullable — a template whose widget needs no
 * connection has none. The column is null; the create API takes absent.
 */
describe("WidgetLibraryPage duplicate", () => {
  it("duplicates a connector-less template without inventing a connector", () => {
    templates = [
      {
        id: "t3",
        name: "Release notes",
        chartType: "markdown",
        connectorType: null as unknown as string,
        query: "# Notes",
        tags: [],
      },
    ];
    render(<WidgetLibraryPage />);

    fireEvent.click(screen.getByLabelText("Duplicate"));

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const payload = mockCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.name).toBe("Release notes (copy)");
    expect(payload.connectorType).toBeUndefined();
    expect("connectorType" in payload).toBe(true);
  });

  it("keeps the connector when the template has one", () => {
    render(<WidgetLibraryPage />);

    fireEvent.click(screen.getAllByLabelText("Duplicate")[0]);

    expect(mockCreate.mock.calls[0][0]).toMatchObject({
      connectorType: "acme-sheets",
    });
  });
});

describe("WidgetLibraryPage — connector facts come from the descriptor list (#1899)", () => {
  it("offers one connector filter option per installed connector, by label", () => {
    render(<WidgetLibraryPage />);
    const filter = screen.getByText("Connector").closest("div")!
      .parentElement as HTMLElement;
    const options = within(filter)
      .getAllByRole("option")
      .map((o) => [o.getAttribute("value"), o.textContent]);
    expect(options).toEqual([
      ["all", "All connectors"],
      ["acme-sheets", "Acme Sheets"],
      ["acme-graph", "Acme Graph"],
    ]);
  });

  it("highlights a template's query in its connector's language, plain text when the connector is gone", () => {
    render(<WidgetLibraryPage />);
    expect(screen.getByText("SHEET budget")).toHaveAttribute(
      "data-language",
      "acmeql",
    );
    expect(screen.getByText("whatever this was")).toHaveAttribute(
      "data-language",
      "",
    );
  });
});
