import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { FormFieldDef } from "@/lib/widget/form-field-def";

// Mock DnD kit — just render children without drag behavior
vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: React.PropsWithChildren) => <>{children}</>,
  closestCenter: vi.fn(),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: () => ({}),
  useSensors: () => [],
}));
vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: React.PropsWithChildren) => <>{children}</>,
  sortableKeyboardCoordinates: vi.fn(),
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
  verticalListSortingStrategy: vi.fn(),
}));
vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: () => "" } },
}));

vi.mock("@neoboard/components", () => ({
  Accordion: ({
    children,
  }: React.PropsWithChildren<{
    value: string[];
    onValueChange: (v: string[]) => void;
  }>) => <div data-testid="accordion">{children}</div>,
  AccordionContent: ({ children }: React.PropsWithChildren) => (
    <div data-testid="accordion-content">{children}</div>
  ),
  AccordionItem: React.forwardRef<
    HTMLDivElement,
    React.PropsWithChildren<{ value: string; style?: React.CSSProperties }>
  >(({ children, value, style }, ref) => (
    <div ref={ref} data-testid={`field-item-${value}`} style={style}>
      {children}
    </div>
  )),
  AccordionTrigger: ({ children }: React.PropsWithChildren) => (
    <div>{children}</div>
  ),
  Badge: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
  Button: ({
    children,
    onClick,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <button onClick={onClick as () => void} {...props}>
      {children}
    </button>
  ),
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
  Input: ({
    value,
    onChange,
    ...props
  }: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input value={value} onChange={onChange} {...props} />
  ),
  Label: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <label {...props}>{children}</label>
  ),
  Select: ({
    children,
    value,
    onValueChange,
  }: React.PropsWithChildren<{
    value: string;
    onValueChange: (v: string) => void;
  }>) => (
    <select value={value} onChange={(e) => onValueChange(e.target.value)}>
      {children}
    </select>
  ),
  SelectContent: ({ children }: React.PropsWithChildren) => <>{children}</>,
  SelectItem: ({
    children,
    value,
  }: React.PropsWithChildren<{ value: string }>) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: ({ children }: React.PropsWithChildren) => <>{children}</>,
  SelectValue: () => null,
  Textarea: ({
    value,
    onChange,
    ...props
  }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea value={value} onChange={onChange} {...props} />
  ),
}));

vi.mock("lucide-react", () => {
  const Icon = () => <span />;
  return { GripVertical: Icon, Plus: Icon, Trash2: Icon };
});

const mockSetFormFields = vi.fn();
let mockFormFields: FormFieldDef[] = [];

vi.mock("@/stores/widget-editor-store", () => ({
  useWidgetEditorStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      formFields: mockFormFields,
      setFormFields: mockSetFormFields,
    }),
}));

import { FormFieldsEditor } from "../form-fields-editor";

describe("FormFieldsEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFormFields = [];
  });

  it("renders empty state", () => {
    render(<FormFieldsEditor />);
    expect(screen.getByText("Form Fields")).toBeInTheDocument();
    expect(screen.getByText(/No fields yet/)).toBeInTheDocument();
  });

  it("renders Add Field button", () => {
    render(<FormFieldsEditor />);
    expect(screen.getByText("Add Field")).toBeInTheDocument();
  });

  it("calls setFormFields when Add Field is clicked", () => {
    render(<FormFieldsEditor />);
    fireEvent.click(screen.getByText("Add Field"));
    expect(mockSetFormFields).toHaveBeenCalled();
    const newFields = mockSetFormFields.mock.calls[0][0] as FormFieldDef[];
    expect(newFields).toHaveLength(1);
    expect(newFields[0].parameterType).toBe("text");
    expect(newFields[0].required).toBe(true);
    expect(newFields[0].label).toBe("");
  });

  it("renders field items when fields exist", () => {
    mockFormFields = [
      {
        id: "f1",
        label: "Movie Title",
        parameterName: "title",
        parameterType: "text",
        required: true,
      },
      {
        id: "f2",
        label: "Category",
        parameterName: "category",
        parameterType: "select",
        required: false,
      },
    ];
    render(<FormFieldsEditor />);
    expect(screen.getByText(/Movie Title/)).toBeInTheDocument();
    expect(screen.getByText(/Category/)).toBeInTheDocument();
    expect(screen.queryByText(/No fields yet/)).not.toBeInTheDocument();
  });

  it("shows field index and label in trigger", () => {
    mockFormFields = [
      {
        id: "f1",
        label: "Movie Title",
        parameterName: "title",
        parameterType: "text",
        required: true,
      },
    ];
    render(<FormFieldsEditor />);
    expect(screen.getByText(/Field 1/)).toBeInTheDocument();
    expect(screen.getByText(/Movie Title/)).toBeInTheDocument();
  });

  it("shows Untitled for fields without label", () => {
    mockFormFields = [
      {
        id: "f1",
        label: "",
        parameterName: "",
        parameterType: "text",
        required: false,
      },
    ];
    render(<FormFieldsEditor />);
    expect(screen.getByText(/Untitled/)).toBeInTheDocument();
  });

  it("shows required indicator on required fields", () => {
    mockFormFields = [
      {
        id: "f1",
        label: "Name",
        parameterName: "name",
        parameterType: "text",
        required: true,
      },
    ];
    render(<FormFieldsEditor />);
    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("shows parameter type badge", () => {
    mockFormFields = [
      {
        id: "f1",
        label: "Name",
        parameterName: "name",
        parameterType: "text",
        required: false,
      },
    ];
    render(<FormFieldsEditor />);
    expect(screen.getByText("text")).toBeInTheDocument();
  });

  it("renders delete button for each field", () => {
    mockFormFields = [
      {
        id: "f1",
        label: "A",
        parameterName: "a",
        parameterType: "text",
        required: false,
      },
      {
        id: "f2",
        label: "B",
        parameterName: "b",
        parameterType: "text",
        required: false,
      },
    ];
    render(<FormFieldsEditor />);
    const deleteButtons = screen.getAllByLabelText(/Delete field/);
    expect(deleteButtons).toHaveLength(2);
  });

  it("removes field when delete is clicked", () => {
    mockFormFields = [
      {
        id: "f1",
        label: "A",
        parameterName: "a",
        parameterType: "text",
        required: false,
      },
      {
        id: "f2",
        label: "B",
        parameterName: "b",
        parameterType: "text",
        required: false,
      },
    ];
    render(<FormFieldsEditor />);
    fireEvent.click(screen.getByLabelText("Delete field 1"));
    expect(mockSetFormFields).toHaveBeenCalled();
    const remaining = mockSetFormFields.mock.calls[0][0] as FormFieldDef[];
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe("f2");
  });

  it("shows param reference hint in field content", () => {
    mockFormFields = [
      {
        id: "f1",
        label: "Title",
        parameterName: "title",
        parameterType: "text",
        required: false,
      },
    ];
    render(<FormFieldsEditor />);
    expect(screen.getByText("$param_title")).toBeInTheDocument();
  });
});
