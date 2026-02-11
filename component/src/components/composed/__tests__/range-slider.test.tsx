import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { RangeSlider } from "../range-slider";

describe("RangeSlider", () => {
  it("renders a slider", () => {
    render(<RangeSlider />);
    const sliders = screen.getAllByRole("slider");
    expect(sliders.length).toBeGreaterThanOrEqual(1);
  });

  it("renders with default value", () => {
    render(<RangeSlider defaultValue={[20, 80]} />);
    const sliders = screen.getAllByRole("slider");
    expect(sliders.length).toBeGreaterThanOrEqual(1);
  });

  it("renders input fields when showInput is true", () => {
    render(<RangeSlider showInput />);
    expect(screen.getByLabelText("Range minimum")).toBeInTheDocument();
    expect(screen.getByLabelText("Range maximum")).toBeInTheDocument();
  });

  it("does not render input fields when showInput is false", () => {
    render(<RangeSlider />);
    expect(screen.queryByLabelText("Range minimum")).not.toBeInTheDocument();
  });

  it("renders marks when provided", () => {
    render(
      <RangeSlider
        marks={[
          { value: 0, label: "0%" },
          { value: 50, label: "50%" },
          { value: 100, label: "100%" },
        ]}
      />
    );
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("shows current values in inputs", () => {
    render(<RangeSlider value={[25, 75]} showInput />);
    const minInput = screen.getByLabelText("Range minimum") as HTMLInputElement;
    const maxInput = screen.getByLabelText("Range maximum") as HTMLInputElement;
    expect(minInput.value).toBe("25");
    expect(maxInput.value).toBe("75");
  });

  it("calls onValueChange when input changes", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<RangeSlider defaultValue={[20, 80]} showInput onValueChange={onValueChange} />);
    const minInput = screen.getByLabelText("Range minimum");
    await user.clear(minInput);
    await user.type(minInput, "30");
    expect(onValueChange).toHaveBeenCalled();
  });

  it("disables inputs when disabled", () => {
    render(<RangeSlider showInput disabled />);
    expect(screen.getByLabelText("Range minimum")).toBeDisabled();
    expect(screen.getByLabelText("Range maximum")).toBeDisabled();
  });

  it("applies custom className", () => {
    const { container } = render(<RangeSlider className="my-slider" />);
    expect(container.firstChild).toHaveClass("my-slider");
  });
});
