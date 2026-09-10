import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { Home } from "lucide-react";
import { Combobox } from "../combobox";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const options = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
  { value: "c", label: "Charlie" },
];

describe("Combobox", () => {
  it("renders placeholder when no value selected", () => {
    render(<Combobox options={options} placeholder="Pick one" />);
    expect(screen.getByRole("combobox")).toHaveTextContent("Pick one");
  });

  it("shows selected option label in trigger", () => {
    render(<Combobox options={options} value="b" />);
    expect(screen.getByRole("combobox")).toHaveTextContent("Beta");
  });

  it("renders icon in trigger when option has icon", () => {
    const iconOptions = [{ value: "home", label: "Home", icon: Home }];
    render(<Combobox options={iconOptions} value="home" />);
    const trigger = screen.getByRole("combobox");
    // The trigger has: icon SVG (opacity-70) + label text + ChevronsUpDown SVG
    // Icon options render an extra SVG compared to non-icon options
    const svgs = trigger.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThanOrEqual(2); // custom icon + chevron
  });

  it("does not render icon in trigger when option has no icon", () => {
    render(<Combobox options={options} value="b" />);
    const trigger = screen.getByRole("combobox");
    // Only ChevronsUpDown SVG, no custom icon
    const svgs = trigger.querySelectorAll("svg");
    expect(svgs.length).toBe(1); // just chevron
  });

  it("calls onChange when option selected", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Combobox options={options} onChange={onChange} />);
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByText("Alpha"));
    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("renders extra icon SVG for options with icon prop", async () => {
    const user = userEvent.setup();
    const iconOptions = [
      { value: "home", label: "Home", icon: Home },
      { value: "other", label: "Other" },
    ];
    render(<Combobox options={iconOptions} />);
    await user.click(screen.getByRole("combobox"));

    // "Home" option has: Check SVG + custom icon SVG + label
    const homeItem = screen.getByText("Home").closest("[cmdk-item]");
    const homeSvgs = homeItem?.querySelectorAll("svg") ?? [];

    // "Other" option has: Check SVG + label (no custom icon)
    const otherItem = screen.getByText("Other").closest("[cmdk-item]");
    const otherSvgs = otherItem?.querySelectorAll("svg") ?? [];

    expect(homeSvgs.length).toBeGreaterThan(otherSvgs.length);
  });
});

// #1411: combobox already filtered on the label, by making the label cmdk's
// value — which merged options that share a label into one cmdk identity.
describe("Combobox — filters on the visible label (#1411)", () => {
  it("keeps an option whose label matches although its value does not", async () => {
    const user = userEvent.setup();
    render(<Combobox options={options} />);
    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByPlaceholderText("Search..."), "Char");
    expect(screen.getByText("Charlie")).toBeInTheDocument();
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
  });

  it("keeps options that share a label distinct for keyboard selection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Combobox
        options={[
          { value: "c-1", label: "Movies (neo4j)" },
          { value: "c-2", label: "Movies (neo4j)" },
        ]}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByPlaceholderText("Search..."));
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("c-2");
  });
});
