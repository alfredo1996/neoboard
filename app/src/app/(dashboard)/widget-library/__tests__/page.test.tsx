import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import React from "react";

/**
 * #1899 — the widget library reads connector facts from the descriptor list
 * (`useConnectors`), not from a map of the connectors somebody knew about. The
 * fixture connector below exists nowhere else in the repo.
 */

const connectors = [
  { type: "acme-sheets", label: "Acme Sheets", queryLanguage: "acmeql" },
  { type: "acme-graph", label: "Acme Graph" },
];

const templates = [
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
    useCreateWidgetTemplate: idle,
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
    Button: Box,
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
