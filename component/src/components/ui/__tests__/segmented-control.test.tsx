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

  it("does nothing when the selected segment is clicked again", async () => {
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
    expect(onValueChange).not.toHaveBeenCalled();
    expect(screen.getByRole("radio", { name: "Day" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("is a block-level track, so a label above it stays on its own line", () => {
    render(
      <SegmentedControl
        aria-label="Range"
        options={options}
        value="day"
        onValueChange={vi.fn()}
      />,
    );
    const cls = screen.getByRole("radiogroup", { name: "Range" }).className;
    expect(cls).toMatch(/(^| )flex( |$)/);
    expect(cls).not.toContain("inline-flex");
  });

  it("gives each segment a 44px hit area on a coarse pointer", () => {
    render(
      <SegmentedControl
        aria-label="Range"
        options={options}
        value="day"
        onValueChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("radio", { name: "Day" }).className).toContain(
      "[@media(pointer:coarse)]:after:",
    );
  });

  it("spaces wrapped rows on a coarse pointer so 44px targets do not overlap", () => {
    render(
      <SegmentedControl
        aria-label="Range"
        options={options}
        value="day"
        onValueChange={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("radiogroup", { name: "Range" }).className,
    ).toContain("[@media(pointer:coarse)]:gap-y-4");
  });
});
