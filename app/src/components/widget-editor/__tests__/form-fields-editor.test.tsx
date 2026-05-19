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

  describe("number-range field editor", () => {
    it("renders rangeNumberType + min/max/step when parameterType is number-range", () => {
      mockFormFields = [
        {
          id: "f1",
          label: "Rating",
          parameterName: "rating",
          parameterType: "number-range",
          required: false,
          rangeNumberType: "integer",
          rangeMin: 0,
          rangeMax: 10,
          rangeStep: 1,
        },
      ];
      render(<FormFieldsEditor />);
      expect(screen.getByText("Number Type")).toBeInTheDocument();
      expect(screen.getByText("Min")).toBeInTheDocument();
      expect(screen.getByText("Max")).toBeInTheDocument();
      expect(screen.getByText("Step")).toBeInTheDocument();
    });

    it("switches to float and bumps default step 1 → 0.1", () => {
      mockFormFields = [
        {
          id: "f1",
          label: "Rating",
          parameterName: "rating",
          parameterType: "number-range",
          required: false,
          rangeStep: 1,
        },
      ];
      render(<FormFieldsEditor />);
      // The Number Type select is the only <select> in the number-range section
      // (Input Type uses the mocked Select that also renders as <select>).
      const allSelects = screen.getAllByRole("combobox");
      // last one is Number Type (rendered below Input Type)
      const numberTypeSelect = allSelects[allSelects.length - 1];
      fireEvent.change(numberTypeSelect, { target: { value: "float" } });
      expect(mockSetFormFields).toHaveBeenCalled();
      const next = mockSetFormFields.mock.calls[0][0] as FormFieldDef[];
      const updated = next.find((f) => f.id === "f1")!;
      expect(updated.rangeNumberType).toBe("float");
      expect(updated.rangeStep).toBe(0.1);
    });

    it("rounds min/max/step when type is integer", () => {
      mockFormFields = [
        {
          id: "f1",
          label: "Rating",
          parameterName: "rating",
          parameterType: "number-range",
          required: false,
          rangeNumberType: "integer",
          rangeMin: 0,
          rangeMax: 10,
          rangeStep: 1,
        },
      ];
      render(<FormFieldsEditor />);
      const minInput = screen.getByDisplayValue("0");
      fireEvent.change(minInput, { target: { value: "3.7" } });
      fireEvent.blur(minInput);
      const setCall = mockSetFormFields.mock.calls.at(-1)!;
      const next = setCall[0] as FormFieldDef[];
      const updated = next.find((f) => f.id === "f1")!;
      expect(updated.rangeMin).toBe(4);
    });

    it("preserves decimals on min when type is float", () => {
      mockFormFields = [
        {
          id: "f1",
          label: "Price",
          parameterName: "price",
          parameterType: "number-range",
          required: false,
          rangeNumberType: "float",
          rangeMin: 0,
          rangeMax: 10,
          rangeStep: 0.1,
        },
      ];
      render(<FormFieldsEditor />);
      const minInput = screen.getByDisplayValue("0");
      fireEvent.change(minInput, { target: { value: "2.5" } });
      fireEvent.blur(minInput);
      const setCall = mockSetFormFields.mock.calls.at(-1)!;
      const next = setCall[0] as FormFieldDef[];
      const updated = next.find((f) => f.id === "f1")!;
      expect(updated.rangeMin).toBe(2.5);
    });

    it("switches to integer and snaps a fractional step up to >=1", () => {
      mockFormFields = [
        {
          id: "f1",
          label: "Price",
          parameterName: "price",
          parameterType: "number-range",
          required: false,
          rangeNumberType: "float",
          rangeStep: 0.4,
        },
      ];
      render(<FormFieldsEditor />);
      const allSelects = screen.getAllByRole("combobox");
      const numberTypeSelect = allSelects[allSelects.length - 1];
      fireEvent.change(numberTypeSelect, { target: { value: "integer" } });
      const next = mockSetFormFields.mock.calls[0][0] as FormFieldDef[];
      const updated = next.find((f) => f.id === "f1")!;
      expect(updated.rangeNumberType).toBe("integer");
      // Math.max(1, Math.round(0.4)) === 1
      expect(updated.rangeStep).toBe(1);
    });

    it("rounds max when type is integer", () => {
      mockFormFields = [
        {
          id: "f1",
          label: "Rating",
          parameterName: "rating",
          parameterType: "number-range",
          required: false,
          rangeNumberType: "integer",
          rangeMin: 0,
          rangeMax: 10,
          rangeStep: 1,
        },
      ];
      render(<FormFieldsEditor />);
      const maxInput = screen.getByDisplayValue("10");
      fireEvent.change(maxInput, { target: { value: "12.6" } });
      fireEvent.blur(maxInput);
      const next = mockSetFormFields.mock.calls.at(-1)![0] as FormFieldDef[];
      expect(next.find((f) => f.id === "f1")!.rangeMax).toBe(13);
    });

    it("preserves decimals on max when type is float", () => {
      mockFormFields = [
        {
          id: "f1",
          label: "Price",
          parameterName: "price",
          parameterType: "number-range",
          required: false,
          rangeNumberType: "float",
          rangeMin: 0,
          rangeMax: 10,
          rangeStep: 0.1,
        },
      ];
      render(<FormFieldsEditor />);
      const maxInput = screen.getByDisplayValue("10");
      fireEvent.change(maxInput, { target: { value: "7.25" } });
      fireEvent.blur(maxInput);
      const next = mockSetFormFields.mock.calls.at(-1)![0] as FormFieldDef[];
      expect(next.find((f) => f.id === "f1")!.rangeMax).toBe(7.25);
    });

    it("snaps step to >=1 whole number when type is integer", () => {
      mockFormFields = [
        {
          id: "f1",
          label: "Rating",
          parameterName: "rating",
          parameterType: "number-range",
          required: false,
          rangeNumberType: "integer",
          rangeMin: 0,
          rangeMax: 100,
          rangeStep: 5,
        },
      ];
      render(<FormFieldsEditor />);
      const stepInput = screen.getByDisplayValue("5");
      fireEvent.change(stepInput, { target: { value: "0.3" } });
      fireEvent.blur(stepInput);
      const next = mockSetFormFields.mock.calls.at(-1)![0] as FormFieldDef[];
      // Math.max(1, Math.round(0.3)) === 1
      expect(next.find((f) => f.id === "f1")!.rangeStep).toBe(1);
    });

    it("preserves decimal step when type is float", () => {
      mockFormFields = [
        {
          id: "f1",
          label: "Price",
          parameterName: "price",
          parameterType: "number-range",
          required: false,
          rangeNumberType: "float",
          rangeMin: 0,
          rangeMax: 10,
          rangeStep: 0.5,
        },
      ];
      render(<FormFieldsEditor />);
      const stepInput = screen.getByDisplayValue("0.5");
      fireEvent.change(stepInput, { target: { value: "0.25" } });
      fireEvent.blur(stepInput);
      const next = mockSetFormFields.mock.calls.at(-1)![0] as FormFieldDef[];
      expect(next.find((f) => f.id === "f1")!.rangeStep).toBe(0.25);
    });

    it("reverts to prior value when min input is blurred while empty", () => {
      mockFormFields = [
        {
          id: "f1",
          label: "Rating",
          parameterName: "rating",
          parameterType: "number-range",
          required: false,
          rangeNumberType: "integer",
          rangeMin: 5,
          rangeMax: 10,
          rangeStep: 1,
        },
      ];
      render(<FormFieldsEditor />);
      const minInput = screen.getByDisplayValue("5");
      fireEvent.change(minInput, { target: { value: "" } });
      fireEvent.blur(minInput);
      // Regression: previously Number("") was 0 and silently zeroed rangeMin.
      expect(mockSetFormFields).not.toHaveBeenCalled();
      // Draft snaps back to prior value.
      expect((minInput as HTMLInputElement).value).toBe("5");
    });

    it("reverts to prior value on garbage input", () => {
      mockFormFields = [
        {
          id: "f1",
          label: "Rating",
          parameterName: "rating",
          parameterType: "number-range",
          required: false,
          rangeNumberType: "integer",
          rangeMin: 7,
          rangeMax: 10,
          rangeStep: 1,
        },
      ];
      render(<FormFieldsEditor />);
      const minInput = screen.getByDisplayValue("7");
      fireEvent.change(minInput, { target: { value: "abc" } });
      fireEvent.blur(minInput);
      expect(mockSetFormFields).not.toHaveBeenCalled();
    });

    it("commits min on blur (does not commit while typing)", () => {
      mockFormFields = [
        {
          id: "f1",
          label: "Rating",
          parameterName: "rating",
          parameterType: "number-range",
          required: false,
          rangeNumberType: "integer",
          rangeMin: 0,
          rangeMax: 10,
          rangeStep: 1,
        },
      ];
      render(<FormFieldsEditor />);
      const minInput = screen.getByDisplayValue("0");
      fireEvent.change(minInput, { target: { value: "3" } });
      // No commit yet — still typing.
      expect(mockSetFormFields).not.toHaveBeenCalled();
      fireEvent.blur(minInput);
      const next = mockSetFormFields.mock.calls.at(-1)![0] as FormFieldDef[];
      expect(next.find((f) => f.id === "f1")!.rangeMin).toBe(3);
    });

    it("shows inline error when min >= max", () => {
      mockFormFields = [
        {
          id: "f1",
          label: "Rating",
          parameterName: "rating",
          parameterType: "number-range",
          required: false,
          rangeNumberType: "integer",
          rangeMin: 10,
          rangeMax: 5,
          rangeStep: 1,
        },
      ];
      render(<FormFieldsEditor />);
      expect(
        screen.getByText(/Min must be less than Max/i),
      ).toBeInTheDocument();
    });

    it("shows inline error when step is 0 (forced via passthrough)", () => {
      mockFormFields = [
        {
          id: "f1",
          label: "Rating",
          parameterName: "rating",
          parameterType: "number-range",
          required: false,
          rangeNumberType: "integer",
          rangeMin: 0,
          rangeMax: 10,
          rangeStep: 0,
        },
      ];
      render(<FormFieldsEditor />);
      expect(
        screen.getByText(/Step must be greater than 0/i),
      ).toBeInTheDocument();
    });

    it("rejects a step of 0 typed by the user (keeps prior step)", () => {
      mockFormFields = [
        {
          id: "f1",
          label: "Rating",
          parameterName: "rating",
          parameterType: "number-range",
          required: false,
          rangeNumberType: "float",
          rangeMin: 0,
          rangeMax: 10,
          rangeStep: 0.5,
        },
      ];
      render(<FormFieldsEditor />);
      const stepInput = screen.getByDisplayValue("0.5");
      fireEvent.change(stepInput, { target: { value: "0" } });
      fireEvent.blur(stepInput);
      const next = mockSetFormFields.mock.calls.at(-1)?.[0] as
        | FormFieldDef[]
        | undefined;
      if (next) {
        // If commit did fire, step must have fallen back to the prior value.
        expect(next.find((f) => f.id === "f1")!.rangeStep).toBe(0.5);
      }
    });
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
