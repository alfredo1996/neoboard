import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Transform } from "@/lib/data-transforms";

// Mock @neoboard/components to avoid cross-package resolution issues
vi.mock("@neoboard/components", () => ({
  Button: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <button {...props}>{children}</button>
  ),
  Input: (props: Record<string, unknown>) => <input {...props} />,
  Label: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <label {...props}>{children}</label>
  ),
  Badge: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <span {...props}>{children}</span>
  ),
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode;
    value?: string;
    onValueChange?: (v: string) => void;
  }) => (
    <select value={value} onChange={(e) => onValueChange?.(e.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectItem: ({
    children,
    value,
  }: {
    children: React.ReactNode;
    value: string;
  }) => <option value={value}>{children}</option>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span>{placeholder}</span>
  ),
}));

// Mock ValueOrParamInput
vi.mock("../value-or-param-input", () => ({
  ValueOrParamInput: (props: Record<string, unknown>) => (
    <input
      data-testid="value-or-param-input"
      value={String(props.value ?? "")}
      placeholder={String(props.placeholder ?? "")}
      onChange={(e) =>
        (props.onValueChange as (v: string) => void)?.(e.target.value)
      }
    />
  ),
}));

// Import after mocks are set up
const { TransformEditor } = await import("../transform-editor");

const columns = ["name", "department", "salary"];

describe("TransformEditor", () => {
  it("renders empty state when no transforms", () => {
    render(
      <TransformEditor transforms={[]} onChange={vi.fn()} columns={columns} />,
    );
    expect(screen.getByText(/no transforms configured/i)).toBeInTheDocument();
  });

  it("renders a filter transform with column, operator, and value", () => {
    const transforms: Transform[] = [
      { type: "filter", column: "department", operator: "==", value: "Sales" },
    ];
    render(
      <TransformEditor
        transforms={transforms}
        onChange={vi.fn()}
        columns={columns}
      />,
    );
    expect(screen.getByText("1. Filter")).toBeInTheDocument();
    expect(screen.getByTestId("value-or-param-input")).toBeInTheDocument();
  });

  it("renders a sort transform with column and direction", () => {
    const transforms: Transform[] = [
      { type: "sort", column: "salary", direction: "desc" },
    ];
    render(
      <TransformEditor
        transforms={transforms}
        onChange={vi.fn()}
        columns={columns}
      />,
    );
    expect(screen.getByText("1. Sort")).toBeInTheDocument();
  });

  it("renders a groupBy transform", () => {
    const transforms: Transform[] = [
      {
        type: "groupBy",
        column: "department",
        aggregations: [{ column: "salary", fn: "sum" }],
      },
    ];
    render(
      <TransformEditor
        transforms={transforms}
        onChange={vi.fn()}
        columns={columns}
      />,
    );
    expect(screen.getByText("1. Group By")).toBeInTheDocument();
  });

  it("renders a calculatedColumn transform with expression input", () => {
    const transforms: Transform[] = [
      { type: "calculatedColumn", name: "bonus", expression: "salary * 0.1" },
    ];
    render(
      <TransformEditor
        transforms={transforms}
        onChange={vi.fn()}
        columns={columns}
      />,
    );
    expect(screen.getByText("1. Calculated Column")).toBeInTheDocument();
    expect(screen.getByDisplayValue("salary * 0.1")).toBeInTheDocument();
  });

  it("renders a renameColumns transform", () => {
    const transforms: Transform[] = [
      { type: "renameColumns", mapping: { name: "Employee" } },
    ];
    render(
      <TransformEditor
        transforms={transforms}
        onChange={vi.fn()}
        columns={columns}
      />,
    );
    expect(screen.getByText("1. Rename Columns")).toBeInTheDocument();
  });

  it("renders a limit transform with count input", () => {
    const transforms: Transform[] = [{ type: "limit", count: 50 }];
    render(
      <TransformEditor
        transforms={transforms}
        onChange={vi.fn()}
        columns={columns}
      />,
    );
    expect(screen.getByText("1. Limit")).toBeInTheDocument();
    expect(screen.getByDisplayValue("50")).toBeInTheDocument();
  });

  it("renders multiple transforms with correct numbering", () => {
    const transforms: Transform[] = [
      { type: "filter", column: "department", operator: "==", value: "Sales" },
      { type: "sort", column: "salary", direction: "asc" },
      { type: "limit", count: 10 },
    ];
    render(
      <TransformEditor
        transforms={transforms}
        onChange={vi.fn()}
        columns={columns}
      />,
    );
    expect(screen.getByText("1. Filter")).toBeInTheDocument();
    expect(screen.getByText("2. Sort")).toBeInTheDocument();
    expect(screen.getByText("3. Limit")).toBeInTheDocument();
  });

  it("calls onChange when remove button is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const transforms: Transform[] = [
      { type: "filter", column: "department", operator: "==", value: "Sales" },
      { type: "limit", count: 10 },
    ];
    render(
      <TransformEditor
        transforms={transforms}
        onChange={onChange}
        columns={columns}
      />,
    );

    const removeButtons = screen.getAllByRole("button", {
      name: "Remove transform",
    });
    await user.click(removeButtons[0]);

    expect(onChange).toHaveBeenCalledWith([{ type: "limit", count: 10 }]);
  });

  it("renders Add button", () => {
    render(
      <TransformEditor transforms={[]} onChange={vi.fn()} columns={columns} />,
    );
    expect(screen.getByRole("button", { name: /add/i })).toBeInTheDocument();
  });
});
