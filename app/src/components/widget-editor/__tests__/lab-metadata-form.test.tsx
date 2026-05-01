import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@neoboard/components", () => ({
  Input: ({
    id,
    value,
    onChange,
    ...props
  }: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input
      id={id}
      value={value}
      onChange={onChange}
      data-testid={id}
      {...props}
    />
  ),
  Label: ({
    children,
    htmlFor,
  }: React.PropsWithChildren<{ htmlFor?: string }>) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
}));

const mockSetLabName = vi.fn();
const mockSetLabDescription = vi.fn();
const mockSetLabTagsInput = vi.fn();
let mockLabName = "";
let mockLabDescription = "";
let mockLabTagsInput = "";

vi.mock("@/stores/widget-editor-store", () => ({
  useWidgetEditorStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      labName: mockLabName,
      setLabName: mockSetLabName,
      labDescription: mockLabDescription,
      setLabDescription: mockSetLabDescription,
      labTagsInput: mockLabTagsInput,
      setLabTagsInput: mockSetLabTagsInput,
    }),
}));

import { LabMetadataForm } from "../lab-metadata-form";

describe("LabMetadataForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLabName = "";
    mockLabDescription = "";
    mockLabTagsInput = "";
  });

  it("renders all three fields", () => {
    render(<LabMetadataForm />);
    expect(screen.getByText("Template Name")).toBeInTheDocument();
    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.getByText("Tags")).toBeInTheDocument();
  });

  it("shows required indicator on template name", () => {
    render(<LabMetadataForm />);
    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("calls setLabName on name input change", () => {
    render(<LabMetadataForm />);
    fireEvent.change(screen.getByTestId("lab-template-name"), {
      target: { value: "My Template" },
    });
    expect(mockSetLabName).toHaveBeenCalledWith("My Template");
  });

  it("calls setLabDescription on description input change", () => {
    render(<LabMetadataForm />);
    fireEvent.change(screen.getByTestId("lab-template-desc"), {
      target: { value: "A description" },
    });
    expect(mockSetLabDescription).toHaveBeenCalledWith("A description");
  });

  it("calls setLabTagsInput on tags input change", () => {
    render(<LabMetadataForm />);
    fireEvent.change(screen.getByTestId("lab-template-tags"), {
      target: { value: "neo4j, monitoring" },
    });
    expect(mockSetLabTagsInput).toHaveBeenCalledWith("neo4j, monitoring");
  });

  it("displays current values from store", () => {
    mockLabName = "Existing";
    mockLabDescription = "Desc";
    mockLabTagsInput = "tag1, tag2";
    render(<LabMetadataForm />);
    expect(screen.getByTestId("lab-template-name")).toHaveValue("Existing");
    expect(screen.getByTestId("lab-template-desc")).toHaveValue("Desc");
    expect(screen.getByTestId("lab-template-tags")).toHaveValue("tag1, tag2");
  });
});
