import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SegmentedControl } from "../segmented-control";

const options = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

describe("SegmentedControl (#2218)", () => {
  it("is a group of radios with the selected one checked", () => {
    render(
      <SegmentedControl
        aria-label="Range"
        options={options}
        value="week"
        onValueChange={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.getByRole("radio", { name: "Week" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: "Day" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("calls onValueChange with the clicked value", async () => {
    const onValueChange = vi.fn();
    render(
      <SegmentedControl
        aria-label="Range"
        options={options}
        value="day"
        onValueChange={onValueChange}
      />,
    );
    await userEvent.click(screen.getByRole("radio", { name: "Month" }));
    expect(onValueChange).toHaveBeenCalledWith("month");
  });

  it("moves focus with the arrow keys and Space selects", async () => {
    const onValueChange = vi.fn();
    render(
      <SegmentedControl
        aria-label="Range"
        options={options}
        value="day"
        onValueChange={onValueChange}
      />,
    );
    await userEvent.tab();
    expect(screen.getByRole("radio", { name: "Day" })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Week" })).toHaveFocus();
    await userEvent.keyboard(" ");
    expect(onValueChange).toHaveBeenCalledWith("week");
  });

  it("reports an empty string when the selected segment is clicked again", async () => {
    const onValueChange = vi.fn();
    render(
      <SegmentedControl
        aria-label="Range"
        options={options}
        value="day"
        onValueChange={onValueChange}
      />,
    );
    await userEvent.click(screen.getByRole("radio", { name: "Day" }));
    expect(onValueChange).toHaveBeenCalledWith("");
  });

  it("is a grey track with a bold white selected segment and no shadow", () => {
    render(
      <SegmentedControl
        aria-label="Range"
        options={options}
        value="day"
        onValueChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("radiogroup", { name: "Range" })).toHaveClass(
      "bg-active",
    );
    const cls = screen.getByRole("radio", { name: "Day" }).className;
    expect(cls).toContain("h-7");
    expect(cls).toContain("data-[state=on]:bg-field");
    expect(cls).toContain("data-[state=on]:font-semibold");
    expect(cls).not.toContain("shadow");
  });
});
