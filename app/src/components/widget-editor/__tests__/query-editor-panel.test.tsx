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
}));

// Import the component after mocks are set up
const { QueryEditorPanel } = await import("../query-editor-panel");

describe("QueryEditorPanel", () => {
  beforeEach(() => {
    useWidgetEditorStore.getState().resetForAdd();
  });

  it("shows warning when no connection is selected", () => {
    // resetForAdd sets connectionId to ""
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

  it("renders the query editor regardless of connection state", () => {
    render(<QueryEditorPanel editorLanguage="cypher" />);
    // Editor should be present even without a connection
    const editor = screen.getByTestId("query-editor");
    expect(editor).toBeInTheDocument();
    // Editor must remain editable even when no connection is selected
    expect(editor).toHaveAttribute("data-read-only", "false");
  });
});
