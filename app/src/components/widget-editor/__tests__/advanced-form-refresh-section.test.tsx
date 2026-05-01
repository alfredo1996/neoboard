import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@neoboard/components", () => ({
  Checkbox: ({
    id,
    checked,
    onCheckedChange,
  }: {
    id?: string;
    checked?: boolean;
    onCheckedChange?: (v: boolean) => void;
  }) => (
    <input
      type="checkbox"
      id={id}
      checked={checked}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      data-testid={id}
    />
  ),
  Label: ({
    children,
    htmlFor,
  }: React.PropsWithChildren<{ htmlFor?: string }>) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
  Button: ({
    children,
    onClick,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <button onClick={onClick as () => void} {...props}>
      {children}
    </button>
  ),
  Badge: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));

vi.mock("@/lib/plugin/chart-helpers", () => ({
  getChartConfig: (type: string) => ({ label: type.toUpperCase() }),
}));

const mockSetRefreshWidgetIds = vi.fn();
let mockRefreshWidgetIds: string[] = [];

vi.mock("@/stores/widget-editor-store", () => ({
  useWidgetEditorStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      refreshWidgetIds: mockRefreshWidgetIds,
      setRefreshWidgetIds: mockSetRefreshWidgetIds,
    }),
}));

import { AdvancedFormRefreshSection } from "../advanced-form-refresh-section";

const WIDGETS = [
  { id: "w1", title: "Sales Chart", chartType: "bar" },
  { id: "w2", title: "Users Table", chartType: "table" },
  { id: "w3", title: "", chartType: "line" },
];

describe("AdvancedFormRefreshSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRefreshWidgetIds = [];
  });

  it("renders header and description", () => {
    render(<AdvancedFormRefreshSection otherWidgets={WIDGETS} />);
    expect(screen.getByText("After Submit")).toBeInTheDocument();
    expect(screen.getByText(/Refresh these widgets/)).toBeInTheDocument();
  });

  it("shows empty state when no other widgets", () => {
    render(<AdvancedFormRefreshSection otherWidgets={[]} />);
    expect(
      screen.getByText("No other widgets on this page."),
    ).toBeInTheDocument();
  });

  it("renders widget list with titles and chart type badges", () => {
    render(<AdvancedFormRefreshSection otherWidgets={WIDGETS} />);
    expect(screen.getByText("Sales Chart")).toBeInTheDocument();
    expect(screen.getByText("Users Table")).toBeInTheDocument();
    expect(screen.getByText("(untitled)")).toBeInTheDocument();
    expect(screen.getByText("BAR")).toBeInTheDocument();
    expect(screen.getByText("TABLE")).toBeInTheDocument();
  });

  it("shows selection count", () => {
    mockRefreshWidgetIds = ["w1"];
    render(<AdvancedFormRefreshSection otherWidgets={WIDGETS} />);
    expect(screen.getByText("1 of 3 selected")).toBeInTheDocument();
  });

  it("calls setRefreshWidgetIds when widget checkbox toggled on", () => {
    render(<AdvancedFormRefreshSection otherWidgets={WIDGETS} />);
    fireEvent.click(screen.getByTestId("refresh-widget-w1"));
    expect(mockSetRefreshWidgetIds).toHaveBeenCalledWith(["w1"]);
  });

  it("calls setRefreshWidgetIds when widget checkbox toggled off", () => {
    mockRefreshWidgetIds = ["w1", "w2"];
    render(<AdvancedFormRefreshSection otherWidgets={WIDGETS} />);
    fireEvent.click(screen.getByTestId("refresh-widget-w1"));
    expect(mockSetRefreshWidgetIds).toHaveBeenCalledWith(["w2"]);
  });

  it("select all selects all widgets", () => {
    render(<AdvancedFormRefreshSection otherWidgets={WIDGETS} />);
    fireEvent.click(screen.getByText("Select all"));
    expect(mockSetRefreshWidgetIds).toHaveBeenCalledWith(["w1", "w2", "w3"]);
  });

  it("deselect all clears selection when all selected", () => {
    mockRefreshWidgetIds = ["w1", "w2", "w3"];
    render(<AdvancedFormRefreshSection otherWidgets={WIDGETS} />);
    fireEvent.click(screen.getByText("Deselect all"));
    expect(mockSetRefreshWidgetIds).toHaveBeenCalledWith([]);
  });
});
