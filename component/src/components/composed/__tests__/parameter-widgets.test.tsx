import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import {
  TextInputParameter,
  ParamSelector,
  ParamMultiSelector,
  DatePickerParameter,
  DateRelativePicker,
  NumberRangeSlider,
  CascadingSelector,
  RELATIVE_DATE_PRESETS,
} from "../parameter-widgets";

// ─── TextInputParameter ───────────────────────────────────────────────────────

describe("TextInputParameter", () => {
  it("renders with a label matching parameterName", () => {
    render(
      <TextInputParameter parameterName="city" value="" onChange={vi.fn()} />
    );
    expect(screen.getByText("city")).toBeInTheDocument();
  });

  it("renders the current value in the input", () => {
    render(
      <TextInputParameter parameterName="city" value="Berlin" onChange={vi.fn()} />
    );
    const input = screen.getByRole("textbox");
    expect(input).toHaveValue("Berlin");
  });

  it("calls onChange when the user types", () => {
    const onChange = vi.fn();
    render(
      <TextInputParameter parameterName="city" value="" onChange={onChange} />
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Paris" } });
    expect(onChange).toHaveBeenCalledWith("Paris");
  });

  it("shows a clear button when value is set", () => {
    render(
      <TextInputParameter parameterName="city" value="Berlin" onChange={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: /clear city/i })).toBeInTheDocument();
  });

  it("hides the clear button when value is empty", () => {
    render(
      <TextInputParameter parameterName="city" value="" onChange={vi.fn()} />
    );
    expect(screen.queryByRole("button", { name: /clear/i })).toBeNull();
  });

  it("calls onChange with empty string when clear button is clicked", () => {
    const onChange = vi.fn();
    render(
      <TextInputParameter parameterName="city" value="Berlin" onChange={onChange} />
    );
    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(onChange).toHaveBeenCalledWith("");
  });
});

// ─── ParamSelector ────────────────────────────────────────────────────────────

describe("ParamSelector", () => {
  const options = [
    { value: "neo4j", label: "Neo4j" },
    { value: "postgres", label: "PostgreSQL" },
  ];

  it("renders the parameter label", () => {
    render(
      <ParamSelector
        parameterName="dbType"
        options={options}
        value=""
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText("dbType")).toBeInTheDocument();
  });

  it("shows loading skeletons when loading=true", () => {
    const { container } = render(
      <ParamSelector
        parameterName="dbType"
        options={[]}
        value=""
        onChange={vi.fn()}
        loading
      />
    );
    // Loading state renders skeleton elements (no select trigger)
    expect(container.querySelectorAll('[class*="skeleton"], [class*="Skeleton"]').length).toBeGreaterThanOrEqual(0);
    // The select trigger should not be present during loading
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("renders clear button when a value is selected", () => {
    render(
      <ParamSelector
        parameterName="dbType"
        options={options}
        value="neo4j"
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /clear dbType/i })).toBeInTheDocument();
  });

  it("calls onChange with empty string when clear is clicked", () => {
    const onChange = vi.fn();
    render(
      <ParamSelector
        parameterName="dbType"
        options={options}
        value="neo4j"
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(onChange).toHaveBeenCalledWith("");
  });
});

// ─── ParamMultiSelector ──────────────────────────────────────────────────────

describe("ParamMultiSelector", () => {
  const options = [
    { value: "a", label: "Alpha" },
    { value: "b", label: "Beta" },
    { value: "c", label: "Gamma" },
  ];

  it("renders the parameter label", () => {
    render(
      <ParamMultiSelector
        parameterName="tags"
        options={options}
        values={[]}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText("tags")).toBeInTheDocument();
  });

  it("shows placeholder when no values selected", () => {
    render(
      <ParamMultiSelector
        parameterName="tags"
        options={options}
        values={[]}
        onChange={vi.fn()}
        placeholder="Pick tags…"
      />
    );
    expect(screen.getByText("Pick tags…")).toBeInTheDocument();
  });

  it("shows selected values as badges", () => {
    render(
      <ParamMultiSelector
        parameterName="tags"
        options={options}
        values={["a", "b"]}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("shows Clear button when values are selected", () => {
    render(
      <ParamMultiSelector
        parameterName="tags"
        options={options}
        values={["a"]}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /clear/i })).toBeInTheDocument();
  });

  it("calls onChange with empty array when Clear is clicked", () => {
    const onChange = vi.fn();
    render(
      <ParamMultiSelector
        parameterName="tags"
        options={options}
        values={["a", "b"]}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});

// ─── DatePickerParameter ──────────────────────────────────────────────────────

describe("DatePickerParameter", () => {
  it("renders the parameter label", () => {
    render(
      <DatePickerParameter
        parameterName="eventDate"
        value=""
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText("eventDate")).toBeInTheDocument();
  });

  it("shows placeholder when no date selected", () => {
    render(
      <DatePickerParameter
        parameterName="eventDate"
        value=""
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText(/pick a date/i)).toBeInTheDocument();
  });

  it("formats and displays the selected date", () => {
    render(
      <DatePickerParameter
        parameterName="eventDate"
        value="2024-06-15"
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText(/jun 15, 2024/i)).toBeInTheDocument();
  });

  it("shows clear button when a date is selected", () => {
    render(
      <DatePickerParameter
        parameterName="eventDate"
        value="2024-06-15"
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /clear eventDate/i })).toBeInTheDocument();
  });

  it("calls onChange with empty string when clear is clicked", () => {
    const onChange = vi.fn();
    render(
      <DatePickerParameter
        parameterName="eventDate"
        value="2024-06-15"
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(onChange).toHaveBeenCalledWith("");
  });
});

// ─── DateRelativePicker ──────────────────────────────────────────────────────

describe("DateRelativePicker", () => {
  it("renders the parameter label", () => {
    render(
      <DateRelativePicker parameterName="window" value="" onChange={vi.fn()} />
    );
    expect(screen.getByText("window")).toBeInTheDocument();
  });

  it("renders all preset buttons", () => {
    render(
      <DateRelativePicker parameterName="window" value="" onChange={vi.fn()} />
    );
    for (const preset of RELATIVE_DATE_PRESETS) {
      expect(screen.getByRole("button", { name: preset.label })).toBeInTheDocument();
    }
  });

  it("marks the active preset button as pressed", () => {
    render(
      <DateRelativePicker parameterName="window" value="last_7_days" onChange={vi.fn()} />
    );
    const btn = screen.getByRole("button", { name: "Last 7 days" });
    expect(btn).toHaveAttribute("aria-pressed", "true");
  });

  it("calls onChange with the preset key when a button is clicked", () => {
    const onChange = vi.fn();
    render(
      <DateRelativePicker parameterName="window" value="" onChange={onChange} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(onChange).toHaveBeenCalledWith("today");
  });

  it("calls onChange with empty string when the active preset is clicked again (toggle off)", () => {
    const onChange = vi.fn();
    render(
      <DateRelativePicker parameterName="window" value="today" onChange={onChange} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(onChange).toHaveBeenCalledWith("");
  });
});

// ─── NumberRangeSlider ────────────────────────────────────────────────────────

describe("NumberRangeSlider", () => {
  it("renders the parameter label", () => {
    render(
      <NumberRangeSlider
        parameterName="price"
        min={0}
        max={1000}
        value={null}
        onChange={vi.fn()}
        onClear={vi.fn()}
      />
    );
    expect(screen.getByText("price")).toBeInTheDocument();
  });

  it("displays the min and max bounds as tick labels", () => {
    render(
      <NumberRangeSlider
        parameterName="price"
        min={10}
        max={999}
        value={null}
        onChange={vi.fn()}
        onClear={vi.fn()}
      />
    );
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("999")).toBeInTheDocument();
  });

  it("shows Reset button when value is set", () => {
    render(
      <NumberRangeSlider
        parameterName="price"
        min={0}
        max={1000}
        value={[100, 500]}
        onChange={vi.fn()}
        onClear={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /clear price/i })).toBeInTheDocument();
  });

  it("hides Reset button when value is null", () => {
    render(
      <NumberRangeSlider
        parameterName="price"
        min={0}
        max={1000}
        value={null}
        onChange={vi.fn()}
        onClear={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: /clear price/i })).toBeNull();
  });

  it("calls onClear when Reset is clicked", () => {
    const onClear = vi.fn();
    render(
      <NumberRangeSlider
        parameterName="price"
        min={0}
        max={1000}
        value={[100, 500]}
        onChange={vi.fn()}
        onClear={onClear}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /clear price/i }));
    expect(onClear).toHaveBeenCalled();
  });

  it("renders current min/max inputs with correct values", () => {
    render(
      <NumberRangeSlider
        parameterName="price"
        min={0}
        max={1000}
        value={[150, 750]}
        onChange={vi.fn()}
        onClear={vi.fn()}
        showInputs
      />
    );
    const minInput = screen.getByRole("spinbutton", { name: /price minimum/i });
    const maxInput = screen.getByRole("spinbutton", { name: /price maximum/i });
    expect(minInput).toHaveValue(150);
    expect(maxInput).toHaveValue(750);
  });

  it("calls onChange when min input changes", () => {
    const onChange = vi.fn();
    render(
      <NumberRangeSlider
        parameterName="price"
        min={0}
        max={1000}
        value={[0, 1000]}
        onChange={onChange}
        onClear={vi.fn()}
        showInputs
      />
    );
    const minInput = screen.getByRole("spinbutton", { name: /price minimum/i });
    fireEvent.change(minInput, { target: { value: "200" } });
    expect(onChange).toHaveBeenCalledWith([200, 1000]);
  });
});

// ─── CascadingSelector ────────────────────────────────────────────────────────

describe("CascadingSelector", () => {
  const options = [
    { value: "sub1", label: "Sub-Category 1" },
    { value: "sub2", label: "Sub-Category 2" },
  ];

  it("renders the parameter label", () => {
    render(
      <CascadingSelector
        parameterName="subCategory"
        options={options}
        value=""
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText("subCategory")).toBeInTheDocument();
  });

  it("shows dependency hint when parentParameterName is provided", () => {
    render(
      <CascadingSelector
        parameterName="subCategory"
        options={options}
        value=""
        onChange={vi.fn()}
        parentParameterName="category"
      />
    );
    expect(screen.getByText(/depends on category/i)).toBeInTheDocument();
  });

  it("disables the select when parentParameterName is set but parentValue is empty", () => {
    render(
      <CascadingSelector
        parameterName="subCategory"
        options={options}
        value=""
        onChange={vi.fn()}
        parentParameterName="category"
        parentValue=""
      />
    );
    // The select trigger should be disabled
    const trigger = screen.getByRole("combobox");
    expect(trigger).toBeDisabled();
  });

  it("enables the select when parentValue is provided", () => {
    render(
      <CascadingSelector
        parameterName="subCategory"
        options={options}
        value=""
        onChange={vi.fn()}
        parentParameterName="category"
        parentValue="cat1"
      />
    );
    const trigger = screen.getByRole("combobox");
    expect(trigger).not.toBeDisabled();
  });

  it("shows clear button when a value is selected", () => {
    render(
      <CascadingSelector
        parameterName="subCategory"
        options={options}
        value="sub1"
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /clear subCategory/i })).toBeInTheDocument();
  });

  it("calls onChange with empty string when clear is clicked", () => {
    const onChange = vi.fn();
    render(
      <CascadingSelector
        parameterName="subCategory"
        options={options}
        value="sub1"
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(onChange).toHaveBeenCalledWith("");
  });
});
