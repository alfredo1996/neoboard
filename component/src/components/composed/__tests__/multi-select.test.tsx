import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MultiSelect } from "../multi-select";

const options = [
  { value: "react", label: "React" },
  { value: "vue", label: "Vue" },
  { value: "angular", label: "Angular" },
  { value: "svelte", label: "Svelte" },
  { value: "solid", label: "Solid" },
];

describe("MultiSelect", () => {
  it("renders placeholder when no value selected", () => {
    render(<MultiSelect options={options} value={[]} placeholder="Pick..." />);
    expect(screen.getByText("Pick...")).toBeInTheDocument();
  });

  it("renders selected items as badges", () => {
    render(<MultiSelect options={options} value={["react", "vue"]} />);
    expect(screen.getByText("React")).toBeInTheDocument();
    expect(screen.getByText("Vue")).toBeInTheDocument();
  });

  it("hides placeholder when items are selected", () => {
    render(
      <MultiSelect options={options} value={["react"]} placeholder="Pick..." />,
    );
    expect(screen.queryByText("Pick...")).not.toBeInTheDocument();
  });

  it("shows overflow badge when more items than maxDisplay", () => {
    render(
      <MultiSelect
        options={options}
        value={["react", "vue", "angular", "svelte"]}
        maxDisplay={2}
      />,
    );
    expect(screen.getByText("React")).toBeInTheDocument();
    expect(screen.getByText("Vue")).toBeInTheDocument();
    expect(screen.queryByText("Angular")).not.toBeInTheDocument();
    expect(screen.getByText("+2 more")).toBeInTheDocument();
  });

  it("does not show overflow badge when items fit within maxDisplay", () => {
    render(
      <MultiSelect options={options} value={["react", "vue"]} maxDisplay={3} />,
    );
    expect(screen.queryByText(/more/)).not.toBeInTheDocument();
  });

  it("renders combobox trigger with correct aria attributes", () => {
    render(<MultiSelect options={options} value={[]} />);
    const trigger = screen.getByRole("combobox");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("is disabled when disabled prop is true", () => {
    render(<MultiSelect options={options} value={[]} disabled />);
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("calls onChange with item removed when remove button clicked", async () => {
    const onChange = vi.fn();
    const { container } = render(
      <MultiSelect
        options={options}
        value={["react", "vue"]}
        onChange={onChange}
      />,
    );

    // Find the X buttons inside badges - they're the small buttons within badge elements
    const removeButtons = container.querySelectorAll(".ml-1.rounded-full");
    // Click the first remove button (React)
    removeButtons[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith(["vue"]);
  });

  it("shows correct overflow count with maxDisplay=1", () => {
    render(
      <MultiSelect
        options={options}
        value={["react", "vue", "angular"]}
        maxDisplay={1}
      />,
    );
    expect(screen.getByText("React")).toBeInTheDocument();
    expect(screen.getByText("+2 more")).toBeInTheDocument();
  });

  it("uses renderOption to draw each row when provided (#902)", async () => {
    // cmdk's Command list calls scrollIntoView on focus — jsdom doesn't
    // implement it. Polyfill for this test only.
    Element.prototype.scrollIntoView = vi.fn();
    const user = (await import("@testing-library/user-event")).default.setup();
    const renderOption = vi.fn((opt: { value: string; label: string }) => (
      <span>
        {opt.label}
        <span data-testid={`badge-${opt.value}`}>BADGE</span>
      </span>
    ));
    render(
      <MultiSelect
        options={options.slice(0, 2)}
        value={[]}
        renderOption={renderOption}
      />,
    );
    // Open the popover so the list items render
    await user.click(screen.getByRole("combobox"));
    // renderOption fires for every option in the list (React may re-render)
    expect(renderOption).toHaveBeenCalled();
    expect(screen.getByTestId("badge-react")).toBeInTheDocument();
    expect(screen.getByTestId("badge-vue")).toBeInTheDocument();
  });
});
