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
      />
    );
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Select or type...")).toBeInTheDocument();
  });

  it("shows suggestions in dropdown", async () => {
    const user = userEvent.setup();
    render(
      <CreatableCombobox
        suggestions={["alpha", "beta"]}
        value=""
        onChange={() => {}}
      />
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
      />
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
      />
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
      />
    );
    expect(screen.getByDisplayValue("myValue")).toBeInTheDocument();
  });

  it("renders with empty suggestions", async () => {
    const user = userEvent.setup();
    render(
      <CreatableCombobox
        suggestions={[]}
        value=""
        onChange={() => {}}
      />
    );
    await user.click(screen.getByRole("combobox"));
    // Should not crash, no items rendered
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });
});
