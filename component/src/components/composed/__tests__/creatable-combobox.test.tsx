import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { CreatableCombobox } from "../creatable-combobox";

describe("CreatableCombobox", () => {
  it("renders with placeholder", () => {
    render(
      <CreatableCombobox
        suggestions={["alpha", "beta"]}
        value=""
        onChange={() => {}}
        placeholder="Select or type..."
      />,
    );
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Select or type..."),
    ).toBeInTheDocument();
  });

  it("shows suggestions in dropdown", async () => {
    const user = userEvent.setup();
    render(
      <CreatableCombobox
        suggestions={["alpha", "beta"]}
        value=""
        onChange={() => {}}
      />,
    );
    // Focus the input to open suggestions
    await user.click(screen.getByRole("combobox"));
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();
  });

  it("calls onChange when a suggestion is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <CreatableCombobox
        suggestions={["alpha", "beta"]}
        value=""
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByText("alpha"));
    expect(onChange).toHaveBeenCalledWith("alpha");
  });

  it("allows free-text entry via typing", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <CreatableCombobox
        suggestions={["alpha", "beta"]}
        value=""
        onChange={onChange}
      />,
    );
    const input = screen.getByRole("combobox");
    await user.type(input, "custom_param");
    // onChange should have been called with the typed value
    expect(onChange).toHaveBeenLastCalledWith("custom_param");
  });

  it("displays current value", () => {
    render(
      <CreatableCombobox
        suggestions={["alpha"]}
        value="myValue"
        onChange={() => {}}
      />,
    );
    expect(screen.getByDisplayValue("myValue")).toBeInTheDocument();
  });

  it("renders with empty suggestions", async () => {
    const user = userEvent.setup();
    render(<CreatableCombobox suggestions={[]} value="" onChange={() => {}} />);
    await user.click(screen.getByRole("combobox"));
    // Should not crash, no items rendered
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("navigates suggestions with ArrowDown and selects with Enter", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <CreatableCombobox
        suggestions={["alpha", "beta"]}
        value=""
        onChange={onChange}
      />,
    );
    const input = screen.getByRole("combobox");
    await user.click(input);
    await user.keyboard("{ArrowDown}"); // highlight "alpha"
    expect(input).toHaveAttribute("aria-activedescendant");
    await user.keyboard("{ArrowDown}"); // highlight "beta"
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenLastCalledWith("beta");
  });

  it("wraps to the last suggestion with ArrowUp", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <CreatableCombobox
        suggestions={["alpha", "beta"]}
        value=""
        onChange={onChange}
      />,
    );
    const input = screen.getByRole("combobox");
    await user.click(input);
    await user.keyboard("{ArrowUp}"); // from nothing highlighted → last ("beta")
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenLastCalledWith("beta");
  });

  it("ignores ArrowDown when there are no suggestions", async () => {
    const user = userEvent.setup();
    render(<CreatableCombobox suggestions={[]} value="" onChange={() => {}} />);
    const input = screen.getByRole("combobox");
    await user.click(input);
    await user.keyboard("{ArrowDown}");
    // No listbox, no active descendant — the handler bailed cleanly.
    expect(input).not.toHaveAttribute("aria-activedescendant");
  });

  it("closes the suggestion list on Escape", async () => {
    const user = userEvent.setup();
    render(
      <CreatableCombobox
        suggestions={["alpha", "beta"]}
        value=""
        onChange={() => {}}
      />,
    );
    const input = screen.getByRole("combobox");
    await user.click(input);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
