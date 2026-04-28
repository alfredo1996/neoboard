import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

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
  LoadingButton: ({
    children,
    onClick,
    disabled,
    loading,
    loadingText,
  }: React.PropsWithChildren<{
    onClick?: () => void;
    disabled?: boolean;
    loading?: boolean;
    loadingText?: string;
  }>) => (
    <button onClick={onClick} disabled={disabled || loading}>
      {loading ? loadingText : children}
    </button>
  ),
  DialogFooter: ({ children }: React.PropsWithChildren) => (
    <div data-testid="dialog-footer">{children}</div>
  ),
}));

let mockStoreState: Record<string, unknown> = {};

vi.mock("@/stores/widget-editor-store", () => ({
  useWidgetEditorStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector(mockStoreState),
}));

import { ModalFooter } from "../modal-footer";

const baseProps = {
  mode: "add" as const,
  labError: null,
  labSaving: false,
  saveStatus: "idle" as const,
  isContentOnly: false,
  onCancel: vi.fn(),
  onSave: vi.fn(),
  onLabSave: vi.fn(),
};

describe("ModalFooter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreState = {
      chartType: "bar",
      connectionId: "conn-1",
      query: "MATCH (n) RETURN n",
      labName: "My Template",
      paramWidgetName: "",
      paramUIType: "text",
      chartOptions: {},
    };
  });

  it("renders cancel and save buttons in add mode", () => {
    render(<ModalFooter {...baseProps} />);
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByText("Add Widget")).toBeInTheDocument();
  });

  it("shows 'Save Changes' in edit mode", () => {
    render(<ModalFooter {...baseProps} mode="edit" />);
    expect(screen.getByText("Save Changes")).toBeInTheDocument();
  });

  it("shows 'Saved!' when saveStatus is saved", () => {
    render(<ModalFooter {...baseProps} saveStatus="saved" />);
    expect(screen.getByText("Saved!")).toBeInTheDocument();
  });

  it("shows 'Saving...' when saveStatus is saving", () => {
    render(<ModalFooter {...baseProps} saveStatus="saving" />);
    expect(screen.getByText("Saving...")).toBeInTheDocument();
  });

  it("calls onCancel when cancel clicked", () => {
    render(<ModalFooter {...baseProps} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(baseProps.onCancel).toHaveBeenCalled();
  });

  it("calls onSave when save clicked", () => {
    render(<ModalFooter {...baseProps} />);
    fireEvent.click(screen.getByText("Add Widget"));
    expect(baseProps.onSave).toHaveBeenCalled();
  });

  it("disables save when query is empty", () => {
    mockStoreState.query = "";
    render(<ModalFooter {...baseProps} />);
    expect(screen.getByText("Add Widget")).toBeDisabled();
  });

  it("shows lab mode buttons in lab-create mode", () => {
    render(<ModalFooter {...baseProps} mode="lab-create" />);
    expect(screen.getByText("Create Template")).toBeInTheDocument();
  });

  it("shows lab mode buttons in lab-edit mode", () => {
    render(<ModalFooter {...baseProps} mode="lab-edit" />);
    expect(screen.getByText("Save Template")).toBeInTheDocument();
  });

  it("calls onLabSave for lab mode save", () => {
    render(<ModalFooter {...baseProps} mode="lab-create" />);
    fireEvent.click(screen.getByText("Create Template"));
    expect(baseProps.onLabSave).toHaveBeenCalled();
  });

  it("disables lab save when name is empty", () => {
    mockStoreState.labName = "";
    render(<ModalFooter {...baseProps} mode="lab-create" />);
    expect(screen.getByText("Create Template")).toBeDisabled();
  });

  it("shows lab error message", () => {
    render(
      <ModalFooter {...baseProps} mode="lab-create" labError="Save failed" />,
    );
    expect(screen.getByText("Save failed")).toBeInTheDocument();
  });

  it("shows saving state for lab mode", () => {
    render(<ModalFooter {...baseProps} mode="lab-create" labSaving={true} />);
    expect(screen.getByText("Saving...")).toBeInTheDocument();
  });

  it("content-only widgets don't require query", () => {
    mockStoreState.query = "";
    render(<ModalFooter {...baseProps} isContentOnly={true} />);
    expect(screen.getByText("Add Widget")).not.toBeDisabled();
  });

  it("param-select requires param name", () => {
    mockStoreState.chartType = "parameter-select";
    mockStoreState.paramWidgetName = "";
    render(<ModalFooter {...baseProps} />);
    expect(screen.getByText("Add Widget")).toBeDisabled();
  });

  it("param-select with name is enabled", () => {
    mockStoreState.chartType = "parameter-select";
    mockStoreState.paramWidgetName = "myParam";
    mockStoreState.paramUIType = "text";
    render(<ModalFooter {...baseProps} />);
    expect(screen.getByText("Add Widget")).not.toBeDisabled();
  });

  it("form requires connection and query", () => {
    mockStoreState.chartType = "form";
    mockStoreState.connectionId = "";
    render(<ModalFooter {...baseProps} />);
    expect(screen.getByText("Add Widget")).toBeDisabled();
  });
});
