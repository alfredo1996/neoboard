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
}));

const mockSetStylingEnabled = vi.fn();
const mockSetDialogStep = vi.fn();
let mockStylingEnabled = false;
let mockStylingRules: unknown[] = [];

vi.mock("@/stores/widget-editor-store", () => ({
  useWidgetEditorStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      stylingEnabled: mockStylingEnabled,
      setStylingEnabled: mockSetStylingEnabled,
      stylingRules: mockStylingRules,
      setDialogStep: mockSetDialogStep,
    }),
}));

import { AdvancedStylingSection } from "../advanced-styling-section";

describe("AdvancedStylingSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStylingEnabled = false;
    mockStylingRules = [];
  });

  it("renders header and checkbox", () => {
    render(<AdvancedStylingSection />);
    expect(screen.getByText("Styling")).toBeInTheDocument();
    expect(screen.getByText("Enable rule-based styling")).toBeInTheDocument();
  });

  it("does not show rules info when disabled", () => {
    render(<AdvancedStylingSection />);
    expect(
      screen.queryByText("No styling rules configured."),
    ).not.toBeInTheDocument();
  });

  it("shows rules info and manage button when enabled", () => {
    mockStylingEnabled = true;
    render(<AdvancedStylingSection />);
    expect(
      screen.getByText("No styling rules configured."),
    ).toBeInTheDocument();
    expect(screen.getByText("Manage Styling Rules")).toBeInTheDocument();
  });

  it("shows rule count when rules exist", () => {
    mockStylingEnabled = true;
    mockStylingRules = [{ id: "1" }, { id: "2" }, { id: "3" }];
    render(<AdvancedStylingSection />);
    expect(
      screen.getByText("3 styling rule(s) configured."),
    ).toBeInTheDocument();
  });

  it("calls setDialogStep when manage button clicked", () => {
    mockStylingEnabled = true;
    render(<AdvancedStylingSection />);
    fireEvent.click(screen.getByText("Manage Styling Rules"));
    expect(mockSetDialogStep).toHaveBeenCalledWith("styling-rules");
  });

  it("calls setStylingEnabled when checkbox toggled", () => {
    render(<AdvancedStylingSection />);
    fireEvent.click(screen.getByTestId("styling-enabled"));
    expect(mockSetStylingEnabled).toHaveBeenCalledWith(true);
  });
});
