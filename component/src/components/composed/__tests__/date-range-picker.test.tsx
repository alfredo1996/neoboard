import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { format } from "date-fns";
import { DateRangePicker } from "../date-range-picker";

describe("DateRangePicker", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders placeholder when no value", () => {
    render(<DateRangePicker />);
    expect(screen.getByText("Pick a date range")).toBeInTheDocument();
  });

  it("renders custom placeholder", () => {
    render(<DateRangePicker placeholder="Select dates..." />);
    expect(screen.getByText("Select dates...")).toBeInTheDocument();
  });

  it("displays formatted date range when value is provided", () => {
    const value = {
      from: new Date("2025-06-01"),
      to: new Date("2025-06-15"),
    };
    render(<DateRangePicker value={value} />);
    expect(screen.getByText(/Jun 01, 2025/)).toBeInTheDocument();
    expect(screen.getByText(/Jun 15, 2025/)).toBeInTheDocument();
  });

  it("displays only from date when to is missing", () => {
    const value = {
      from: new Date("2025-06-01"),
      to: undefined,
    };
    render(<DateRangePicker value={value} />);
    expect(screen.getByText("Jun 01, 2025")).toBeInTheDocument();
  });

  it("shows preset buttons when presets=true", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<DateRangePicker presets={true} />);

    await user.click(screen.getByText("Pick a date range"));
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Yesterday")).toBeInTheDocument();
    expect(screen.getByText("Last 7 days")).toBeInTheDocument();
    expect(screen.getByText("Last 30 days")).toBeInTheDocument();
    expect(screen.getByText("This month")).toBeInTheDocument();
    expect(screen.getByText("This year")).toBeInTheDocument();
  });

  it("does not show presets when presets=false", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<DateRangePicker presets={false} />);

    await user.click(screen.getByText("Pick a date range"));
    expect(screen.queryByText("Today")).not.toBeInTheDocument();
    expect(screen.queryByText("Last 7 days")).not.toBeInTheDocument();
  });

  it("calls onChange with correct range for 'Today' preset", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onChange = vi.fn();
    render(<DateRangePicker onChange={onChange} />);

    await user.click(screen.getByText("Pick a date range"));
    await user.click(screen.getByText("Today"));

    expect(onChange).toHaveBeenCalledOnce();
    const range = onChange.mock.calls[0][0];
    expect(format(range.from, "yyyy-MM-dd")).toBe("2025-06-15");
    expect(format(range.to, "yyyy-MM-dd")).toBe("2025-06-15");
  });

  it("calls onChange with correct range for 'Yesterday' preset", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onChange = vi.fn();
    render(<DateRangePicker onChange={onChange} />);

    await user.click(screen.getByText("Pick a date range"));
    await user.click(screen.getByText("Yesterday"));

    const range = onChange.mock.calls[0][0];
    expect(format(range.from, "yyyy-MM-dd")).toBe("2025-06-14");
    expect(format(range.to, "yyyy-MM-dd")).toBe("2025-06-14");
  });

  it("calls onChange with correct range for 'Last 7 days' preset", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onChange = vi.fn();
    render(<DateRangePicker onChange={onChange} />);

    await user.click(screen.getByText("Pick a date range"));
    await user.click(screen.getByText("Last 7 days"));

    const range = onChange.mock.calls[0][0];
    expect(format(range.from, "yyyy-MM-dd")).toBe("2025-06-09");
    expect(format(range.to, "yyyy-MM-dd")).toBe("2025-06-15");
  });

  it("calls onChange with correct range for 'This month' preset", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onChange = vi.fn();
    render(<DateRangePicker onChange={onChange} />);

    await user.click(screen.getByText("Pick a date range"));
    await user.click(screen.getByText("This month"));

    const range = onChange.mock.calls[0][0];
    expect(format(range.from, "yyyy-MM-dd")).toBe("2025-06-01");
    expect(format(range.to, "yyyy-MM-dd")).toBe("2025-06-30");
  });

  it("calls onChange with correct range for 'This year' preset", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onChange = vi.fn();
    render(<DateRangePicker onChange={onChange} />);

    await user.click(screen.getByText("Pick a date range"));
    await user.click(screen.getByText("This year"));

    const range = onChange.mock.calls[0][0];
    expect(format(range.from, "yyyy-MM-dd")).toBe("2025-01-01");
    expect(format(range.to, "yyyy-MM-dd")).toBe("2025-06-15");
  });
});
