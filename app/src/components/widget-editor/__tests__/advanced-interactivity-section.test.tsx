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
  }: React.PropsWithChildren<{ onClick?: () => void }>) => (
    <button onClick={onClick}>{children}</button>
  ),
  Alert: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <div role="alert" {...props}>
      {children}
    </div>
  ),
  AlertTitle: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  AlertDescription: ({ children }: React.PropsWithChildren) => (
    <div>{children}</div>
  ),
}));

vi.mock("lucide-react", () => ({
  Info: () => <span data-testid="info-icon" />,
}));

const mockSetClickActionEnabled = vi.fn();
const mockSetDialogStep = vi.fn();
let mockClickActionEnabled = false;
let mockActionRules: unknown[] = [];

vi.mock("@/stores/widget-editor-store", () => ({
  useWidgetEditorStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      clickActionEnabled: mockClickActionEnabled,
      setClickActionEnabled: mockSetClickActionEnabled,
      actionRules: mockActionRules,
      setDialogStep: mockSetDialogStep,
    }),
}));

import { AdvancedInteractivitySection } from "../advanced-interactivity-section";

describe("AdvancedInteractivitySection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClickActionEnabled = false;
    mockActionRules = [];
  });

  it("renders header and checkbox", () => {
    render(<AdvancedInteractivitySection clickActionCollisions={[]} />);
    expect(screen.getByText("Interactivity")).toBeInTheDocument();
    expect(screen.getByText("Enable click action")).toBeInTheDocument();
  });

  it("does not show rules info when disabled", () => {
    render(<AdvancedInteractivitySection clickActionCollisions={[]} />);
    expect(
      screen.queryByText("No action rules configured."),
    ).not.toBeInTheDocument();
  });

  it("shows rules info and manage button when enabled", () => {
    mockClickActionEnabled = true;
    render(<AdvancedInteractivitySection clickActionCollisions={[]} />);
    expect(screen.getByText("No action rules configured.")).toBeInTheDocument();
    expect(screen.getByText("Manage Action Rules")).toBeInTheDocument();
  });

  it("shows rule count when rules exist", () => {
    mockClickActionEnabled = true;
    mockActionRules = [{ id: "1" }, { id: "2" }];
    render(<AdvancedInteractivitySection clickActionCollisions={[]} />);
    expect(
      screen.getByText("2 action rule(s) configured."),
    ).toBeInTheDocument();
  });

  it("calls setDialogStep when manage button clicked", () => {
    mockClickActionEnabled = true;
    render(<AdvancedInteractivitySection clickActionCollisions={[]} />);
    fireEvent.click(screen.getByText("Manage Action Rules"));
    expect(mockSetDialogStep).toHaveBeenCalledWith("rules");
  });

  it("shows collision banner for single collision", () => {
    mockClickActionEnabled = true;
    render(
      <AdvancedInteractivitySection
        clickActionCollisions={[{ widgetId: "w1", title: "Widget A" }]}
      />,
    );
    expect(
      screen.getByText(/A parameter set here is also set by: Widget A/),
    ).toBeInTheDocument();
  });

  it("shows collision banner for multiple collisions", () => {
    mockClickActionEnabled = true;
    render(
      <AdvancedInteractivitySection
        clickActionCollisions={[
          { widgetId: "w1", title: "Widget A" },
          { widgetId: "w2", title: "Widget B" },
        ]}
      />,
    );
    expect(
      screen.getByText(
        /Parameters set here are also set by: Widget A, Widget B/,
      ),
    ).toBeInTheDocument();
  });

  it("calls setClickActionEnabled when checkbox toggled", () => {
    render(<AdvancedInteractivitySection clickActionCollisions={[]} />);
    fireEvent.click(screen.getByTestId("click-action-enabled"));
    expect(mockSetClickActionEnabled).toHaveBeenCalledWith(true);
  });
});
