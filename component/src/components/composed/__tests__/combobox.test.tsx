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
    expect(trigger.querySelector("svg")).toBeTruthy();
  });

  it("calls onChange when option selected", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Combobox options={options} onChange={onChange} />);
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByText("Alpha"));
    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("renders icon in dropdown options", async () => {
    const user = userEvent.setup();
    const iconOptions = [
      { value: "home", label: "Home", icon: Home },
      { value: "other", label: "Other" },
    ];
    render(<Combobox options={iconOptions} />);
    await user.click(screen.getByRole("combobox"));
    const homeOption = screen.getByText("Home");
    expect(homeOption.parentElement?.querySelector("svg")).toBeTruthy();
  });
});
