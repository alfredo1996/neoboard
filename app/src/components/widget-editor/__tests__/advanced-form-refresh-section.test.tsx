import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Stub @neoboard/components: substitute a controllable MultiSelect that
// exposes its options + onChange via plain DOM so tests can interact without
// dealing with Radix Popover focus-trap and cmdk's scrollIntoView.
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
  Badge: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
  MultiSelect: ({
    options,
    value,
    onChange,
    placeholder,
    renderOption,
  }: {
    options: { value: string; label: string }[];
    value: string[];
    onChange: (next: string[]) => void;
    placeholder?: string;
    renderOption?: (opt: { value: string; label: string }) => React.ReactNode;
  }) => (
    <div data-testid="multi-select">
      <span>{placeholder}</span>
      {options.map((opt) => {
        const selected = value.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            data-testid={`refresh-widget-${opt.value}`}
            data-selected={selected}
            onClick={() =>
              onChange(
                selected
                  ? value.filter((v) => v !== opt.value)
                  : [...value, opt.value],
              )
            }
          >
            {renderOption ? renderOption(opt) : opt.label}
          </button>
        );
      })}
    </div>
  ),
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
    expect(screen.queryByTestId("multi-select")).toBeNull();
  });

  it("renders the MultiSelect with widget titles and chart-type badges", () => {
    render(<AdvancedFormRefreshSection otherWidgets={WIDGETS} />);
    expect(screen.getByTestId("multi-select")).toBeInTheDocument();
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

  it("calls setRefreshWidgetIds when a widget is toggled on", () => {
    render(<AdvancedFormRefreshSection otherWidgets={WIDGETS} />);
    fireEvent.click(screen.getByTestId("refresh-widget-w1"));
    expect(mockSetRefreshWidgetIds).toHaveBeenCalledWith(["w1"]);
  });

  it("calls setRefreshWidgetIds when a widget is toggled off", () => {
    mockRefreshWidgetIds = ["w1", "w2"];
    render(<AdvancedFormRefreshSection otherWidgets={WIDGETS} />);
    fireEvent.click(screen.getByTestId("refresh-widget-w1"));
    expect(mockSetRefreshWidgetIds).toHaveBeenCalledWith(["w2"]);
  });

  it("Select all selects every widget on the page", () => {
    render(<AdvancedFormRefreshSection otherWidgets={WIDGETS} />);
    fireEvent.click(screen.getByText("Select all"));
    expect(mockSetRefreshWidgetIds).toHaveBeenCalledWith(["w1", "w2", "w3"]);
  });

  it("Deselect all clears selection when all are selected", () => {
    mockRefreshWidgetIds = ["w1", "w2", "w3"];
    render(<AdvancedFormRefreshSection otherWidgets={WIDGETS} />);
    fireEvent.click(screen.getByText("Deselect all"));
    expect(mockSetRefreshWidgetIds).toHaveBeenCalledWith([]);
  });
});
