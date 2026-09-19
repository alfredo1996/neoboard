import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { WidgetTemplate } from "@/lib/db/schema";

vi.mock("@neoboard/components", () => ({
  Button: ({
    children,
    onClick,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <button onClick={onClick as () => void} {...props}>
      {children}
    </button>
  ),
  Input: (props: Record<string, unknown>) => <input {...props} />,
  Badge: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <span {...props}>{children}</span>
  ),
  DialogHeader: ({ children }: React.PropsWithChildren) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: React.PropsWithChildren) => <h2>{children}</h2>,
  DialogDescription: ({ children }: React.PropsWithChildren) => (
    <p>{children}</p>
  ),
  DialogFooter: ({ children }: React.PropsWithChildren) => (
    <div>{children}</div>
  ),
  CodePreview: ({ value, language }: { value: string; language: string }) => (
    <pre data-language={language}>{value}</pre>
  ),
}));

vi.mock("@/lib/plugin/chart-helpers", () => ({
  getChartConfig: (t: string) => ({ label: t }),
}));

// What GET /api/connectors serves (#1899): a fixture connector, so the
// highlighting below can only have come from the descriptor list.
vi.mock("@/hooks/use-connectors", () => ({
  useConnectors: () => ({
    data: [{ type: "acme-sheets", queryLanguage: "acmeql" }],
  }),
}));

import { TemplateBrowser } from "../template-browser";

const sampleTemplate: WidgetTemplate = {
  id: "t1",
  name: "Movies Bar Chart",
  description: "Top movies",
  chartType: "bar",
  connectorType: "neo4j",
  connectionId: null,
  query: "MATCH (m:Movie) RETURN m LIMIT 10",
  settings: {},
  tags: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  userId: "u1",
  tenantId: "t1",
} as unknown as WidgetTemplate;

describe("TemplateBrowser", () => {
  it("shows loading state", () => {
    render(
      <TemplateBrowser
        templates={undefined}
        loading={true}
        connectorType={null}
        onApply={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByText(/Loading templates/)).toBeInTheDocument();
  });

  it("shows empty state when no templates", () => {
    render(
      <TemplateBrowser
        templates={[]}
        loading={false}
        connectorType="neo4j"
        onApply={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByText(/No templates available/)).toBeInTheDocument();
    expect(screen.getByText(/for neo4j/)).toBeInTheDocument();
  });

  it("renders template cards when templates are present", () => {
    render(
      <TemplateBrowser
        templates={[sampleTemplate]}
        loading={false}
        connectorType="neo4j"
        onApply={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByText("Movies Bar Chart")).toBeInTheDocument();
  });

  it("highlights each query in its connector's language, read from the descriptor list", () => {
    render(
      <TemplateBrowser
        templates={[
          { ...sampleTemplate, connectorType: "acme-sheets", query: "SHEET 1" },
          { ...sampleTemplate, id: "t2", connectorType: "gone", query: "??" },
        ]}
        loading={false}
        connectorType={null}
        onApply={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByText("SHEET 1")).toHaveAttribute(
      "data-language",
      "acmeql",
    );
    // A connector that is not installed: plain text, not somebody's grammar.
    expect(screen.getByText("??")).toHaveAttribute("data-language", "");
  });

  it("filters by search", () => {
    render(
      <TemplateBrowser
        templates={[
          sampleTemplate,
          { ...sampleTemplate, id: "t2", name: "Users Table" },
        ]}
        loading={false}
        connectorType="neo4j"
        onApply={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    const search = screen.getByPlaceholderText(/Search by name/);
    fireEvent.change(search, { target: { value: "Movies" } });
    expect(screen.getByText("Movies Bar Chart")).toBeInTheDocument();
    expect(screen.queryByText("Users Table")).not.toBeInTheDocument();
  });

  it("shows 'no match' when search has no results", () => {
    render(
      <TemplateBrowser
        templates={[sampleTemplate]}
        loading={false}
        connectorType="neo4j"
        onApply={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    const search = screen.getByPlaceholderText(/Search by name/);
    fireEvent.change(search, { target: { value: "xyz-nothing" } });
    expect(screen.getByText(/No templates match/)).toBeInTheDocument();
  });

  it("calls onApply when a template card is clicked", () => {
    const onApply = vi.fn();
    render(
      <TemplateBrowser
        templates={[sampleTemplate]}
        loading={false}
        connectorType="neo4j"
        onApply={onApply}
        onBack={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Movies Bar Chart"));
    expect(onApply).toHaveBeenCalledWith(sampleTemplate);
  });

  it("calls onBack when Back button is clicked", () => {
    const onBack = vi.fn();
    render(
      <TemplateBrowser
        templates={[]}
        loading={false}
        connectorType={null}
        onApply={vi.fn()}
        onBack={onBack}
      />,
    );
    fireEvent.click(screen.getByText("Back"));
    expect(onBack).toHaveBeenCalled();
  });
});
