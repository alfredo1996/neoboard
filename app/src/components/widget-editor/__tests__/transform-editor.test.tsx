import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Transform } from "@/lib/query/data-transforms";

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
    // The trigger's id lands on the control, as on the real trigger (#2096).
    <select
      id={
        (
          React.Children.toArray(children)[0] as React.ReactElement<{
            id?: string;
          }>
        ).props.id
      }
      value={value}
      onChange={(e) => onValueChange?.(e.target.value)}
    >
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

// Mock @radix-ui/react-select primitives used directly in transform-editor
vi.mock("@radix-ui/react-select", () => ({
  Item: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
  ItemText: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  ItemIndicator: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

// Mock ValueOrParamInput
vi.mock("../value-or-param-input", () => ({
  ValueOrParamInput: (props: Record<string, unknown>) => (
    <input
      data-testid="value-or-param-input"
      id={props.id as string | undefined}
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

// Feeds each commit back in as the transforms prop, as the widget editor does.
function StatefulEditor({
  initial,
  onChange = vi.fn(),
}: Readonly<{ initial: Transform[]; onChange?: (t: Transform[]) => void }>) {
  const [transforms, setTransforms] = React.useState(initial);
  return (
    <TransformEditor
      transforms={transforms}
      onChange={(next) => {
        onChange(next);
        setTransforms(next);
      }}
      columns={columns}
    />
  );
}

describe("TransformEditor", () => {
  it("renders empty state when no transforms", () => {
    render(
      <TransformEditor transforms={[]} onChange={vi.fn()} columns={columns} />,
    );
    expect(screen.getByText(/no transforms configured/i)).toBeInTheDocument();
  });

  it("shows help text descriptions for each transform type when empty and enabled", () => {
    render(
      <TransformEditor
        transforms={[]}
        onChange={vi.fn()}
        columns={columns}
        enabled={true}
      />,
    );
    // Descriptions appear in both the help list and the select dropdown,
    // so use getAllByText to handle duplicates
    expect(
      screen.getAllByText(/keep rows|remove rows/i).length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/order rows/i).length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText(/aggregate rows/i).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText(/computed column/i).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText(/number of rows/i).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("hides help text when transforms are disabled and list is empty", () => {
    render(
      <TransformEditor
        transforms={[]}
        onChange={vi.fn()}
        columns={columns}
        enabled={false}
      />,
    );
    // When disabled with no transforms, no help text should appear
    expect(
      screen.queryByText(/keep rows matching a condition/i),
    ).not.toBeInTheDocument();
  });

  it("shows disabled message when transforms are disabled but exist", () => {
    render(
      <TransformEditor
        transforms={[{ type: "limit", count: 10 }]}
        onChange={vi.fn()}
        columns={columns}
        enabled={false}
        onEnabledChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/transforms are disabled/i)).toBeInTheDocument();
  });

  it("renders enable/disable checkbox when onEnabledChange is provided", () => {
    const onEnabledChange = vi.fn();
    render(
      <TransformEditor
        transforms={[]}
        onChange={vi.fn()}
        columns={columns}
        enabled={true}
        onEnabledChange={onEnabledChange}
      />,
    );
    expect(screen.getByLabelText(/enable transforms/i)).toBeInTheDocument();
  });

  it("does not render enable/disable checkbox when onEnabledChange is omitted", () => {
    render(
      <TransformEditor transforms={[]} onChange={vi.fn()} columns={columns} />,
    );
    expect(
      screen.queryByLabelText(/enable transforms/i),
    ).not.toBeInTheDocument();
  });

  it("shows run-query message when columns are empty", () => {
    render(<TransformEditor transforms={[]} onChange={vi.fn()} columns={[]} />);
    expect(screen.getByText(/run a query first/i)).toBeInTheDocument();
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

  it.each([
    ["name=Employee, salary=Pay", { name: "Employee", salary: "Pay" }],
    ["n", {}],
  ])(
    "keeps typed %j in the Mappings field and commits its complete pairs (#2096)",
    async (text, mapping) => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <StatefulEditor
          initial={[{ type: "renameColumns", mapping: {} }]}
          onChange={onChange}
        />,
      );
      const field = screen.getByLabelText(/mappings/i);
      await user.type(field, text);
      expect(field).toHaveValue(text);
      expect(onChange).toHaveBeenLastCalledWith([
        { type: "renameColumns", mapping },
      ]);
    },
  );

  it("re-seeds the Mappings field when its card is handed another mapping (#2096)", async () => {
    const user = userEvent.setup();
    render(
      <StatefulEditor
        initial={[
          { type: "renameColumns", mapping: { name: "Employee" } },
          { type: "renameColumns", mapping: { salary: "Pay" } },
        ]}
      />,
    );
    const [first] = screen.getAllByRole("button", { name: "Remove transform" });
    await user.click(first);
    expect(screen.getByLabelText(/mappings/i)).toHaveValue("salary=Pay");
  });

  it("drops a removed card's typed text even when it parses to the next card's mapping (#2096)", async () => {
    const user = userEvent.setup();
    render(
      <StatefulEditor
        initial={[
          { type: "renameColumns", mapping: {} },
          { type: "renameColumns", mapping: {} },
        ]}
      />,
    );
    const [firstField] = screen.getAllByLabelText(/mappings/i);
    await user.type(firstField, "name");
    const [first] = screen.getAllByRole("button", { name: "Remove transform" });
    await user.click(first);
    expect(screen.getByLabelText(/mappings/i)).toHaveValue("");
  });

  it("removes only the aggregation row its button names (#2096)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const aggregations = [
      { column: "salary", fn: "sum" as const },
      { column: "name", fn: "count" as const },
    ];
    render(
      <TransformEditor
        transforms={[{ type: "groupBy", column: "department", aggregations }]}
        onChange={onChange}
        columns={columns}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Remove aggregation salary_sum" }),
    );
    expect(onChange).toHaveBeenCalledWith([
      {
        type: "groupBy",
        column: "department",
        aggregations: [aggregations[1]],
      },
    ]);
  });

  it.each<{ transform: Transform; labels: (string | RegExp)[] }>([
    {
      transform: { type: "filter", column: "name", operator: "==", value: "" },
      labels: ["Column", "Operator", "Value"],
    },
    {
      transform: { type: "sort", column: "name", direction: "asc" },
      labels: ["Column", "Direction"],
    },
    {
      transform: {
        type: "groupBy",
        column: "name",
        aggregations: [{ column: "salary", fn: "sum" }],
      },
      labels: ["Group Column", /Aggregations/],
    },
    {
      transform: { type: "calculatedColumn", name: "x", expression: "" },
      labels: ["Column Name", /Expression/],
    },
    { transform: { type: "limit", count: 5 }, labels: ["Max Rows"] },
  ])(
    "names each field of a $transform.type card by its label (#2096)",
    ({ transform, labels }) => {
      render(
        <TransformEditor
          transforms={[transform]}
          onChange={vi.fn()}
          columns={columns}
        />,
      );
      for (const label of labels) {
        expect(screen.getByLabelText(label)).toBeInTheDocument();
      }
    },
  );

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

  it("ignores a cleared limit count instead of committing 1 (#1292)", () => {
    const onChange = vi.fn();
    render(
      <TransformEditor
        transforms={[{ type: "limit", count: 50 }]}
        onChange={onChange}
        columns={columns}
      />,
    );
    fireEvent.change(screen.getByDisplayValue("50"), {
      target: { value: "" },
    });
    // Math.max(1, Number("") || 1) is 1, so clearing silently committed 1.
    expect(onChange).not.toHaveBeenCalled();

    // The guard must not swallow real edits.
    fireEvent.change(screen.getByDisplayValue("50"), {
      target: { value: "25" },
    });
    expect(onChange).toHaveBeenCalledWith([{ type: "limit", count: 25 }]);
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
