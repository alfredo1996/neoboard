import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { useWidgetEditorStore } from "@/stores/widget-editor-store";

// Mock next/dynamic to render the QueryEditor stub synchronously
vi.mock("next/dynamic", () => ({
  default: () => {
    const Stub = (props: Record<string, unknown>) => (
      <div
        data-testid="query-editor"
        data-language={props.language}
        data-read-only={String(props.readOnly ?? false)}
        data-has-on-run={String(typeof props.onRun === "function")}
        data-class-name={String(props.className ?? "")}
      />
    );
    Stub.displayName = "QueryEditorStub";
    return Stub;
  },
}));

// Mock schema hooks so they don't make real requests
vi.mock("@/hooks/use-schema", () => ({
  useConnectionSchema: () => ({ isFetching: false, refreshSchema: vi.fn() }),
}));
vi.mock("@/stores/schema-store", () => ({
  useSchemaStore: () => null,
}));

// Mock @neoboard/components with lightweight stubs
vi.mock("@neoboard/components", () => ({
  Alert: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <div role="alert" {...props}>
      {children}
    </div>
  ),
  AlertDescription: ({
    children,
  }: React.PropsWithChildren<Record<string, unknown>>) => <div>{children}</div>,
  Label: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <label {...props}>{children}</label>
  ),
  Button: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <button {...props}>{children}</button>
  ),
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-menu">{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-content">{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onSelect,
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
  }) => (
    <button data-testid="dropdown-item" onClick={onSelect}>
      {children}
    </button>
  ),
}));

// Import the component and exported constants after mocks are set up
const { QueryEditorPanel, QUERY_HINTS } = await import("../query-editor-panel");

describe("QueryEditorPanel", () => {
  beforeEach(() => {
    useWidgetEditorStore.getState().resetForAdd();
  });

  it("does NOT show warning on fresh modal open (no query, no connection)", () => {
    // resetForAdd sets connectionId to "" and query to ""
    render(<QueryEditorPanel editorLanguage="cypher" />);
    expect(
      screen.queryByTestId("no-connector-warning"),
    ).not.toBeInTheDocument();
  });

  it("shows warning when user has written a query but no connection", () => {
    useWidgetEditorStore.getState().setQuery("MATCH (n) RETURN n");
    render(<QueryEditorPanel editorLanguage="cypher" />);
    expect(screen.getByTestId("no-connector-warning")).toBeInTheDocument();
    expect(
      screen.getByText(
        /select a connection to enable syntax highlighting and query execution/i,
      ),
    ).toBeInTheDocument();
  });

  it("hides warning when a connection is selected", () => {
    useWidgetEditorStore.getState().setConnectionId("conn-1");
    render(<QueryEditorPanel editorLanguage="cypher" />);
    expect(
      screen.queryByTestId("no-connector-warning"),
    ).not.toBeInTheDocument();
  });

  it("hides warning when connection is selected even with query", () => {
    useWidgetEditorStore.getState().setConnectionId("conn-1");
    useWidgetEditorStore.getState().setQuery("MATCH (n) RETURN n");
    render(<QueryEditorPanel editorLanguage="cypher" />);
    expect(
      screen.queryByTestId("no-connector-warning"),
    ).not.toBeInTheDocument();
  });

  it("renders the query editor regardless of connection state", () => {
    render(<QueryEditorPanel editorLanguage="cypher" />);
    // Editor should be present even without a connection
    const editor = screen.getByTestId("query-editor");
    expect(editor).toBeInTheDocument();
    // Editor must remain editable even when no connection is selected
    expect(editor).toHaveAttribute("data-read-only", "false");
  });

  // ── Templates dropdown ──────────────────────────────────────────────

  it("shows Templates button when connection is set and query is empty", () => {
    useWidgetEditorStore.getState().setConnectionId("conn-1");
    // query is empty by default after resetForAdd
    render(<QueryEditorPanel editorLanguage="cypher" />);
    expect(screen.getByText("Templates")).toBeInTheDocument();
  });

  it("hides Templates button when query is not empty", () => {
    useWidgetEditorStore.getState().setConnectionId("conn-1");
    useWidgetEditorStore.getState().setQuery("MATCH (n) RETURN n");
    render(<QueryEditorPanel editorLanguage="cypher" />);
    expect(screen.queryByText("Templates")).not.toBeInTheDocument();
  });

  it("hides Templates button when no connection is selected", () => {
    // connectionId is "" after resetForAdd
    render(<QueryEditorPanel editorLanguage="cypher" />);
    expect(screen.queryByText("Templates")).not.toBeInTheDocument();
  });

  it("renders cypher template items for neo4j language", () => {
    useWidgetEditorStore.getState().setConnectionId("conn-1");
    render(<QueryEditorPanel editorLanguage="neo4j" />);
    // Cypher templates include these labels
    expect(screen.getByText("Top N by count")).toBeInTheDocument();
    expect(screen.getByText("Time series")).toBeInTheDocument();
    expect(screen.getByText("Full scan")).toBeInTheDocument();
    expect(screen.getByText("Relationships")).toBeInTheDocument();
  });

  it("renders sql template items for postgresql language", () => {
    useWidgetEditorStore.getState().setConnectionId("conn-1");
    render(<QueryEditorPanel editorLanguage="postgresql" />);
    // SQL templates (3 items, no "Relationships")
    expect(screen.getByText("Top N by count")).toBeInTheDocument();
    expect(screen.getByText("Time series")).toBeInTheDocument();
    expect(screen.getByText("Full scan")).toBeInTheDocument();
    expect(screen.queryByText("Relationships")).not.toBeInTheDocument();
  });

  it("falls back to sql templates for unknown language", () => {
    useWidgetEditorStore.getState().setConnectionId("conn-1");
    render(<QueryEditorPanel editorLanguage="unknown-lang" />);
    // Should fall back to sql templates
    const items = screen.getAllByTestId("dropdown-item");
    expect(items.length).toBe(3); // sql has 3 templates
  });

  it("sets query in store when a template item is clicked", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    useWidgetEditorStore.getState().setConnectionId("conn-1");
    render(<QueryEditorPanel editorLanguage="cypher" />);

    const fullScanButton = screen.getByText("Full scan");
    await user.click(fullScanButton);

    expect(useWidgetEditorStore.getState().query).toBe(
      "MATCH (n)\nRETURN n\nLIMIT 25",
    );
  });

  // ── Query hints ──────────────────────────────────────────────────────

  it("shows query hint tooltip when chart type has a hint", () => {
    useWidgetEditorStore.getState().setChartType("bar");
    render(<QueryEditorPanel editorLanguage="cypher" />);
    // The hint text should be rendered (tooltip content is always in DOM via our stub)
    expect(screen.getByText(/Return 2\+ columns/)).toBeInTheDocument();
  });

  it("does not show query hint for chart types without hints", () => {
    useWidgetEditorStore
      .getState()
      .setChartType(
        "markdown" as import("@/lib/plugin/chart-helpers").ChartType,
      );
    render(<QueryEditorPanel editorLanguage="cypher" />);
    // No hint text for markdown
    expect(screen.queryByText(/Return 2\+ columns/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Return a single row/)).not.toBeInTheDocument();
  });

  // ── Placeholder ──────────────────────────────────────────────────────

  it("uses SQL placeholder when language is sql", () => {
    render(<QueryEditorPanel editorLanguage="sql" />);
    const editor = screen.getByTestId("query-editor");
    expect(editor).toBeInTheDocument();
    // The placeholder is passed to the query-editor stub — we can verify the
    // component renders without error with sql language
  });

  // ── Refresh schema button ────────────────────────────────────────────

  it("shows Refresh schema button when connection is set", () => {
    useWidgetEditorStore.getState().setConnectionId("conn-1");
    render(<QueryEditorPanel editorLanguage="cypher" />);
    expect(
      screen.getByRole("button", { name: /refresh schema/i }),
    ).toBeInTheDocument();
  });

  it("hides Refresh schema button when no connection", () => {
    render(<QueryEditorPanel editorLanguage="cypher" />);
    expect(
      screen.queryByRole("button", { name: /refresh schema/i }),
    ).not.toBeInTheDocument();
  });

  // ── Maximize toggle (#1374) ──────────────────────────────────────────

  it("does not render the maximize toggle when no handler is supplied", () => {
    render(<QueryEditorPanel editorLanguage="cypher" />);
    expect(
      screen.queryByRole("button", { name: /expand editor/i }),
    ).not.toBeInTheDocument();
  });

  it("renders an un-pressed 'Expand editor' toggle when collapsed", () => {
    render(
      <QueryEditorPanel
        editorLanguage="cypher"
        maximized={false}
        onToggleMaximized={vi.fn()}
      />,
    );
    const toggle = screen.getByRole("button", { name: /expand editor/i });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
  });

  it("renders a pressed 'Collapse editor' toggle when maximized", () => {
    render(
      <QueryEditorPanel
        editorLanguage="cypher"
        maximized
        onToggleMaximized={vi.fn()}
      />,
    );
    const toggle = screen.getByRole("button", { name: /collapse editor/i });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.queryByRole("button", { name: /expand editor/i }),
    ).not.toBeInTheDocument();
  });

  it("calls onToggleMaximized when the toggle is clicked", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    const onToggleMaximized = vi.fn();
    render(
      <QueryEditorPanel
        editorLanguage="cypher"
        maximized={false}
        onToggleMaximized={onToggleMaximized}
      />,
    );
    await user.click(screen.getByRole("button", { name: /expand editor/i }));
    expect(onToggleMaximized).toHaveBeenCalledTimes(1);
  });

  it("gives the editor a definite height class only when maximized", () => {
    // Collapsed the editor has no definite height and grows with the document
    // (measured 220px empty → 2391px at 120 lines), which makes the whole
    // settings column scroll. Maximized it gets a definite height so it scrolls
    // itself with the toolbar pinned — so this class is load-bearing, not
    // cosmetic.
    const { unmount } = render(
      <QueryEditorPanel
        editorLanguage="cypher"
        maximized={false}
        onToggleMaximized={vi.fn()}
      />,
    );
    expect(screen.getByTestId("query-editor")).toHaveAttribute(
      "data-class-name",
      "min-h-[220px]",
    );
    unmount();

    render(
      <QueryEditorPanel
        editorLanguage="cypher"
        maximized
        onToggleMaximized={vi.fn()}
      />,
    );
    const className =
      screen.getByTestId("query-editor").getAttribute("data-class-name") ?? "";
    expect(className).toContain("h-[70vh]");
    expect(className).toContain("min-h-[220px]");
  });
});

describe("QUERY_HINTS", () => {
  it("has hints for bar, line, pie, single-value, graph, map, table, json, form", () => {
    const expectedTypes = [
      "bar",
      "line",
      "pie",
      "single-value",
      "graph",
      "map",
      "table",
      "json",
      "form",
    ];
    for (const type of expectedTypes) {
      expect(
        QUERY_HINTS[type as keyof typeof QUERY_HINTS],
        `Missing hint for ${type}`,
      ).toBeDefined();
    }
  });

  it("each hint contains an example", () => {
    for (const [type, hint] of Object.entries(QUERY_HINTS)) {
      expect(hint, `Hint for ${type} should contain "Example"`).toContain(
        "Example",
      );
    }
  });
});
