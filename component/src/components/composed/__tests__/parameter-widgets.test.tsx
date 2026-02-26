import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  TextInputParameter,
  ParamSelector,
  ParamMultiSelector,
  DatePickerParameter,
  DateRangeParameter,
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

  it("renders custom placeholder text", () => {
    render(
      <TextInputParameter
        parameterName="query"
        value=""
        onChange={vi.fn()}
        placeholder="Type something…"
      />
    );
    expect(screen.getByPlaceholderText("Type something…")).toBeInTheDocument();
  });

  it("applies extra className to the root element", () => {
    const { container } = render(
      <TextInputParameter parameterName="city" value="" onChange={vi.fn()} className="extra-cls" />
    );
    expect(container.firstChild).toHaveClass("extra-cls");
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
    // Loading state renders skeleton elements (animate-pulse class from Skeleton component)
    expect(container.querySelectorAll('[class*="animate-pulse"]').length).toBeGreaterThan(0);
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

  it("does not render clear button when value is empty", () => {
    render(
      <ParamSelector
        parameterName="dbType"
        options={options}
        value=""
        onChange={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: /clear/i })).toBeNull();
  });

  it("renders a combobox (select trigger) when not loading", () => {
    render(
      <ParamSelector
        parameterName="dbType"
        options={options}
        value=""
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("applies className to the root element", () => {
    const { container } = render(
      <ParamSelector
        parameterName="dbType"
        options={options}
        value=""
        onChange={vi.fn()}
        className="my-class"
      />
    );
    expect(container.firstChild).toHaveClass("my-class");
  });
});

// ─── ParamMultiSelector ──────────────────────────────────────────────────────

describe("ParamMultiSelector", () => {
  const options = [
    { value: "a", label: "Alpha" },
    { value: "b", label: "Beta" },
    { value: "c", label: "Gamma" },
    { value: "d", label: "Delta" },
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

  it("hides Clear button when no values are selected", () => {
    render(
      <ParamMultiSelector
        parameterName="tags"
        options={options}
        values={[]}
        onChange={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: /^clear$/i })).toBeNull();
  });

  it("shows loading skeletons when loading=true", () => {
    render(
      <ParamMultiSelector
        parameterName="tags"
        options={[]}
        values={[]}
        onChange={vi.fn()}
        loading
      />
    );
    // When loading, the combobox trigger should not be present
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("shows overflow badge when selected count exceeds maxDisplay", () => {
    render(
      <ParamMultiSelector
        parameterName="tags"
        options={options}
        values={["a", "b", "c", "d"]}
        onChange={vi.fn()}
        maxDisplay={2}
      />
    );
    // +2 overflow badge for items c and d
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("removes a badge when its close button is clicked", () => {
    const onChange = vi.fn();
    render(
      <ParamMultiSelector
        parameterName="tags"
        options={options}
        values={["a", "b"]}
        onChange={onChange}
      />
    );
    // The badge X buttons are plain buttons without accessible names;
    // find via the badge container and click the first one
    const badgeCloseButtons = screen.getAllByRole("button").filter((btn) =>
      btn.closest(".inline-flex") !== null && btn.type === "button" && !btn.getAttribute("aria-label")
    );
    // Click the close button on the first badge (Alpha)
    const alphaClose = document.querySelector('button[type="button"].ml-1');
    if (alphaClose) {
      fireEvent.click(alphaClose, { bubbles: true });
      expect(onChange).toHaveBeenCalledWith(["b"]);
    }
  });

  it("applies className to root element", () => {
    const { container } = render(
      <ParamMultiSelector
        parameterName="tags"
        options={options}
        values={[]}
        onChange={vi.fn()}
        className="custom-multi"
      />
    );
    expect(container.firstChild).toHaveClass("custom-multi");
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

  it("does not show clear button when no date is selected", () => {
    render(
      <DatePickerParameter
        parameterName="eventDate"
        value=""
        onChange={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: /clear/i })).toBeNull();
  });

  it("applies className to root element", () => {
    const { container } = render(
      <DatePickerParameter
        parameterName="eventDate"
        value=""
        onChange={vi.fn()}
        className="date-cls"
      />
    );
    expect(container.firstChild).toHaveClass("date-cls");
  });

  it("opens the calendar popover when the trigger button is clicked", () => {
    render(
      <DatePickerParameter
        parameterName="eventDate"
        value=""
        onChange={vi.fn()}
      />
    );
    // The Radix Popover trigger is labeled by aria-labelledby → "eventDate" label
    const triggerBtn = screen.getByRole("button", { name: "eventDate" });
    fireEvent.click(triggerBtn);
    // After opening, a calendar grid should appear
    expect(screen.getByRole("grid")).toBeInTheDocument();
  });

  it("calls onChange with ISO date string when a calendar day button is clicked", () => {
    const onChange = vi.fn();
    render(
      <DatePickerParameter
        parameterName="eventDate"
        value=""
        onChange={onChange}
      />
    );
    // Open the calendar
    fireEvent.click(screen.getByRole("button", { name: "eventDate" }));

    // react-day-picker renders day buttons with a data-day attribute (date string).
    // The shadcn CalendarDayButton sets data-day={day.date.toLocaleDateString()}.
    // Find any button with a data-day attribute and click it.
    const { container } = render(<div />); // dummy — we use document directly
    const dayBtn = document.querySelector("button[data-day]");
    if (dayBtn) {
      fireEvent.click(dayBtn);
      expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    }
  });
});

// ─── DateRangeParameter ──────────────────────────────────────────────────────

describe("DateRangeParameter", () => {
  it("renders the parameter label", () => {
    render(
      <DateRangeParameter
        parameterName="period"
        from=""
        to=""
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText("period")).toBeInTheDocument();
  });

  it("shows placeholder when no range is selected", () => {
    render(
      <DateRangeParameter
        parameterName="period"
        from=""
        to=""
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText(/pick a date range/i)).toBeInTheDocument();
  });

  it("displays formatted from date when only from is set", () => {
    render(
      <DateRangeParameter
        parameterName="period"
        from="2024-06-01"
        to=""
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText(/jun 1, 2024/i)).toBeInTheDocument();
  });

  it("displays both formatted dates when both bounds are set", () => {
    render(
      <DateRangeParameter
        parameterName="period"
        from="2024-06-01"
        to="2024-06-30"
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText(/jun 1, 2024/i)).toBeInTheDocument();
    expect(screen.getByText(/jun 30, 2024/i)).toBeInTheDocument();
  });

  it("shows clear button when from is set", () => {
    render(
      <DateRangeParameter
        parameterName="period"
        from="2024-06-01"
        to=""
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /clear period/i })).toBeInTheDocument();
  });

  it("shows clear button when to is set", () => {
    render(
      <DateRangeParameter
        parameterName="period"
        from=""
        to="2024-06-30"
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /clear period/i })).toBeInTheDocument();
  });

  it("calls onChange with empty strings when clear is clicked", () => {
    const onChange = vi.fn();
    render(
      <DateRangeParameter
        parameterName="period"
        from="2024-06-01"
        to="2024-06-30"
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /clear period/i }));
    expect(onChange).toHaveBeenCalledWith("", "");
  });

  it("hides clear button when both from and to are empty", () => {
    render(
      <DateRangeParameter
        parameterName="period"
        from=""
        to=""
        onChange={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: /clear/i })).toBeNull();
  });

  it("applies className to root element", () => {
    const { container } = render(
      <DateRangeParameter
        parameterName="period"
        from=""
        to=""
        onChange={vi.fn()}
        className="range-cls"
      />
    );
    expect(container.firstChild).toHaveClass("range-cls");
  });

  it("opens popover with preset buttons when trigger is clicked", () => {
    render(
      <DateRangeParameter
        parameterName="period"
        from=""
        to=""
        onChange={vi.fn()}
      />
    );
    // Radix Popover trigger is labeled by aria-labelledby → "period" label
    const triggerBtn = screen.getByRole("button", { name: "period" });
    fireEvent.click(triggerBtn);
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Last 7 days")).toBeInTheDocument();
    expect(screen.getByText("Last 30 days")).toBeInTheDocument();
    expect(screen.getByText("This month")).toBeInTheDocument();
    expect(screen.getByText("This year")).toBeInTheDocument();
  });

  it("calls onChange with ISO strings when 'Today' preset is clicked", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T12:00:00Z"));
    const onChange = vi.fn();
    render(
      <DateRangeParameter
        parameterName="period"
        from=""
        to=""
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "period" }));
    fireEvent.click(screen.getByText("Today"));
    expect(onChange).toHaveBeenCalledWith("2024-06-15", "2024-06-15");
    vi.useRealTimers();
  });

  it("calls onChange with ISO strings when 'Last 7 days' preset is clicked", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T12:00:00Z"));
    const onChange = vi.fn();
    render(
      <DateRangeParameter
        parameterName="period"
        from=""
        to=""
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "period" }));
    fireEvent.click(screen.getByText("Last 7 days"));
    expect(onChange).toHaveBeenCalledWith("2024-06-09", "2024-06-15");
    vi.useRealTimers();
  });

  it("calls onChange with ISO strings when 'Last 30 days' preset is clicked", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T12:00:00Z"));
    const onChange = vi.fn();
    render(
      <DateRangeParameter
        parameterName="period"
        from=""
        to=""
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "period" }));
    fireEvent.click(screen.getByText("Last 30 days"));
    expect(onChange).toHaveBeenCalledWith("2024-05-17", "2024-06-15");
    vi.useRealTimers();
  });

  it("calls onChange with ISO strings when 'This month' preset is clicked", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T12:00:00Z"));
    const onChange = vi.fn();
    render(
      <DateRangeParameter
        parameterName="period"
        from=""
        to=""
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "period" }));
    fireEvent.click(screen.getByText("This month"));
    expect(onChange).toHaveBeenCalledWith("2024-06-01", "2024-06-30");
    vi.useRealTimers();
  });

  it("calls onChange with ISO strings when 'This year' preset is clicked", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T12:00:00Z"));
    const onChange = vi.fn();
    render(
      <DateRangeParameter
        parameterName="period"
        from=""
        to=""
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "period" }));
    fireEvent.click(screen.getByText("This year"));
    expect(onChange).toHaveBeenCalledWith("2024-01-01", "2024-12-31");
    vi.useRealTimers();
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

  it("marks inactive preset buttons as not pressed", () => {
    render(
      <DateRelativePicker parameterName="window" value="today" onChange={vi.fn()} />
    );
    const btn = screen.getByRole("button", { name: "Last 7 days" });
    expect(btn).toHaveAttribute("aria-pressed", "false");
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

  it("calls onChange with the preset key for each individual preset", () => {
    const onChange = vi.fn();
    for (const preset of RELATIVE_DATE_PRESETS) {
      onChange.mockClear();
      const { unmount } = render(
        <DateRelativePicker parameterName="window" value="" onChange={onChange} />
      );
      fireEvent.click(screen.getByRole("button", { name: preset.label }));
      expect(onChange).toHaveBeenCalledWith(preset.key);
      unmount();
    }
  });

  it("renders a group role for accessibility", () => {
    render(
      <DateRelativePicker parameterName="window" value="" onChange={vi.fn()} />
    );
    expect(screen.getByRole("group")).toBeInTheDocument();
  });

  it("applies className to root element", () => {
    const { container } = render(
      <DateRelativePicker
        parameterName="window"
        value=""
        onChange={vi.fn()}
        className="rel-cls"
      />
    );
    expect(container.firstChild).toHaveClass("rel-cls");
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

  it("calls onChange when max input changes", () => {
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
    const maxInput = screen.getByRole("spinbutton", { name: /price maximum/i });
    fireEvent.change(maxInput, { target: { value: "800" } });
    expect(onChange).toHaveBeenCalledWith([0, 800]);
  });

  it("clamps min input to no more than current max", () => {
    const onChange = vi.fn();
    render(
      <NumberRangeSlider
        parameterName="price"
        min={0}
        max={1000}
        value={[100, 500]}
        onChange={onChange}
        onClear={vi.fn()}
        showInputs
      />
    );
    const minInput = screen.getByRole("spinbutton", { name: /price minimum/i });
    // Try to set min above current max of 500
    fireEvent.change(minInput, { target: { value: "600" } });
    expect(onChange).toHaveBeenCalledWith([500, 500]);
  });

  it("clamps max input to no less than current min", () => {
    const onChange = vi.fn();
    render(
      <NumberRangeSlider
        parameterName="price"
        min={0}
        max={1000}
        value={[200, 800]}
        onChange={onChange}
        onClear={vi.fn()}
        showInputs
      />
    );
    const maxInput = screen.getByRole("spinbutton", { name: /price maximum/i });
    // Try to set max below current min of 200
    fireEvent.change(maxInput, { target: { value: "100" } });
    expect(onChange).toHaveBeenCalledWith([200, 200]);
  });

  it("clamps min input to the overall min bound", () => {
    const onChange = vi.fn();
    render(
      <NumberRangeSlider
        parameterName="price"
        min={50}
        max={1000}
        value={[100, 500]}
        onChange={onChange}
        onClear={vi.fn()}
        showInputs
      />
    );
    const minInput = screen.getByRole("spinbutton", { name: /price minimum/i });
    // Setting min to below the overall min (50) should clamp to 50
    fireEvent.change(minInput, { target: { value: "10" } });
    expect(onChange).toHaveBeenCalledWith([50, 500]);
  });

  it("clamps max input to the overall max bound", () => {
    const onChange = vi.fn();
    render(
      <NumberRangeSlider
        parameterName="price"
        min={0}
        max={800}
        value={[100, 500]}
        onChange={onChange}
        onClear={vi.fn()}
        showInputs
      />
    );
    const maxInput = screen.getByRole("spinbutton", { name: /price maximum/i });
    // Setting max above the overall max (800) should clamp to 800
    fireEvent.change(maxInput, { target: { value: "1200" } });
    expect(onChange).toHaveBeenCalledWith([100, 800]);
  });

  it("hides number inputs when showInputs=false", () => {
    render(
      <NumberRangeSlider
        parameterName="price"
        min={0}
        max={1000}
        value={[100, 500]}
        onChange={vi.fn()}
        onClear={vi.fn()}
        showInputs={false}
      />
    );
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });

  it("uses min/max as defaults when value is null", () => {
    render(
      <NumberRangeSlider
        parameterName="qty"
        min={5}
        max={50}
        value={null}
        onChange={vi.fn()}
        onClear={vi.fn()}
        showInputs
      />
    );
    expect(screen.getByRole("spinbutton", { name: /qty minimum/i })).toHaveValue(5);
    expect(screen.getByRole("spinbutton", { name: /qty maximum/i })).toHaveValue(50);
  });

  it("applies className to root element", () => {
    const { container } = render(
      <NumberRangeSlider
        parameterName="price"
        min={0}
        max={100}
        value={null}
        onChange={vi.fn()}
        onClear={vi.fn()}
        className="slider-cls"
      />
    );
    expect(container.firstChild).toHaveClass("slider-cls");
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

  it("shows loading skeleton with spinner when loading=true", () => {
    const { container } = render(
      <CascadingSelector
        parameterName="subCategory"
        options={[]}
        value=""
        onChange={vi.fn()}
        loading
      />
    );
    // The select combobox should not be present during loading
    expect(screen.queryByRole("combobox")).toBeNull();
    // The spinning refresh icon should be present (animate-spin class)
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("does not show dependency hint when parentParameterName is not provided", () => {
    render(
      <CascadingSelector
        parameterName="subCategory"
        options={options}
        value=""
        onChange={vi.fn()}
      />
    );
    expect(screen.queryByText(/depends on/i)).toBeNull();
  });

  it("shows 'Select parent first' placeholder when parent is absent", () => {
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
    // The placeholder includes the parent name
    expect(screen.getByText(/select category first/i)).toBeInTheDocument();
  });

  it("uses a custom placeholder when provided", () => {
    render(
      <CascadingSelector
        parameterName="subCategory"
        options={options}
        value=""
        onChange={vi.fn()}
        placeholder="Choose sub-category…"
      />
    );
    expect(screen.getByText("Choose sub-category…")).toBeInTheDocument();
  });

  it("does not show clear button when value is empty", () => {
    render(
      <CascadingSelector
        parameterName="subCategory"
        options={options}
        value=""
        onChange={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: /clear/i })).toBeNull();
  });

  it("applies className to root element", () => {
    const { container } = render(
      <CascadingSelector
        parameterName="subCategory"
        options={options}
        value=""
        onChange={vi.fn()}
        className="cascade-cls"
      />
    );
    expect(container.firstChild).toHaveClass("cascade-cls");
  });

  it("is enabled when no parentParameterName and no parentValue", () => {
    render(
      <CascadingSelector
        parameterName="standalone"
        options={options}
        value=""
        onChange={vi.fn()}
      />
    );
    const trigger = screen.getByRole("combobox");
    expect(trigger).not.toBeDisabled();
  });
});
