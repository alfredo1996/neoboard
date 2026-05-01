import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseConnectionDatabases = vi.fn();
vi.mock("@/hooks/use-connection-databases", () => ({
  useConnectionDatabases: (...args: unknown[]) =>
    mockUseConnectionDatabases(...args),
}));

// Track Select onValueChange so we can simulate user selection
let capturedOnValueChange: ((v: string) => void) | undefined;

vi.mock("@neoboard/components", () => ({
  Label: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <label {...props}>{children}</label>
  ),
  Select: ({
    children,
    onValueChange,
    value,
  }: React.PropsWithChildren<{
    onValueChange?: (v: string) => void;
    value?: string;
  }>) => {
    capturedOnValueChange = onValueChange;
    return (
      <div data-testid="select" data-value={value}>
        {children}
      </div>
    );
  },
  SelectTrigger: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <button {...props}>{children}</button>
  ),
  SelectValue: (props: { placeholder?: string }) => (
    <span data-testid="select-value">{props.placeholder}</span>
  ),
  SelectContent: ({ children }: React.PropsWithChildren) => (
    <div data-testid="select-content">{children}</div>
  ),
  SelectItem: ({
    children,
    value,
  }: React.PropsWithChildren<{ value: string }>) => (
    <div data-testid={`select-item-${value}`}>{children}</div>
  ),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------
import { DatabaseSelector } from "../database-selector";

describe("DatabaseSelector", () => {
  const defaultProps = {
    connectionId: "conn-1",
    database: "",
    onDatabaseChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnValueChange = undefined;
  });

  it("renders loading state when databases are being fetched", () => {
    mockUseConnectionDatabases.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    render(<DatabaseSelector {...defaultProps} />);

    expect(screen.getByText("Loading databases...")).toBeInTheDocument();
    expect(screen.queryByTestId("select")).not.toBeInTheDocument();
  });

  it("renders empty state when no databases are available", () => {
    mockUseConnectionDatabases.mockReturnValue({
      data: { databases: [] },
      isLoading: false,
    });

    render(<DatabaseSelector {...defaultProps} />);

    expect(screen.getByText("No databases available")).toBeInTheDocument();
    expect(screen.queryByTestId("select")).not.toBeInTheDocument();
  });

  it("renders empty state when data is undefined and not loading", () => {
    mockUseConnectionDatabases.mockReturnValue({
      data: undefined,
      isLoading: false,
    });

    render(<DatabaseSelector {...defaultProps} />);

    expect(screen.getByText("No databases available")).toBeInTheDocument();
  });

  it("renders Select dropdown with database items", () => {
    mockUseConnectionDatabases.mockReturnValue({
      data: { databases: ["mydb", "otherdb"] },
      isLoading: false,
    });

    render(<DatabaseSelector {...defaultProps} />);

    expect(screen.getByTestId("select")).toBeInTheDocument();
    expect(screen.getByTestId("select-item-__default__")).toHaveTextContent(
      "Connection default",
    );
    expect(screen.getByTestId("select-item-mydb")).toHaveTextContent("mydb");
    expect(screen.getByTestId("select-item-otherdb")).toHaveTextContent(
      "otherdb",
    );
  });

  it("sets Select value to __default__ when database prop is empty", () => {
    mockUseConnectionDatabases.mockReturnValue({
      data: { databases: ["mydb"] },
      isLoading: false,
    });

    render(<DatabaseSelector {...defaultProps} database="" />);

    expect(screen.getByTestId("select")).toHaveAttribute(
      "data-value",
      "__default__",
    );
  });

  it("sets Select value to the database prop when provided", () => {
    mockUseConnectionDatabases.mockReturnValue({
      data: { databases: ["mydb"] },
      isLoading: false,
    });

    render(<DatabaseSelector {...defaultProps} database="mydb" />);

    expect(screen.getByTestId("select")).toHaveAttribute("data-value", "mydb");
  });

  it("calls onDatabaseChange with the selected database name", () => {
    mockUseConnectionDatabases.mockReturnValue({
      data: { databases: ["mydb", "otherdb"] },
      isLoading: false,
    });
    const onDatabaseChange = vi.fn();

    render(
      <DatabaseSelector
        {...defaultProps}
        onDatabaseChange={onDatabaseChange}
      />,
    );

    // Simulate Select onValueChange
    expect(capturedOnValueChange).toBeDefined();
    capturedOnValueChange!("mydb");
    expect(onDatabaseChange).toHaveBeenCalledWith("mydb");
  });

  it("calls onDatabaseChange with empty string when __default__ is selected", () => {
    mockUseConnectionDatabases.mockReturnValue({
      data: { databases: ["mydb"] },
      isLoading: false,
    });
    const onDatabaseChange = vi.fn();

    render(
      <DatabaseSelector
        {...defaultProps}
        onDatabaseChange={onDatabaseChange}
      />,
    );

    capturedOnValueChange!("__default__");
    expect(onDatabaseChange).toHaveBeenCalledWith("");
  });

  it("passes connectionId to useConnectionDatabases hook", () => {
    mockUseConnectionDatabases.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    render(<DatabaseSelector {...defaultProps} connectionId="conn-42" />);

    expect(mockUseConnectionDatabases).toHaveBeenCalledWith("conn-42");
  });
});
