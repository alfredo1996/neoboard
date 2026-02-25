import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ParamSelector } from "../parameter-widgets/param-selector";

describe("ParamSelector — empty options message", () => {
  it("shows 'No options available' in dropdown when options is empty and loading is false", () => {
    render(
      <ParamSelector
        parameterName="movie"
        options={[]}
        value=""
        onChange={vi.fn()}
        loading={false}
      />
    );

    // Open the select by clicking the trigger
    const trigger = screen.getByRole("combobox");
    fireEvent.click(trigger);

    expect(screen.getByText("No options available")).toBeInTheDocument();
  });

  it("does not show 'No options available' when options are present", () => {
    render(
      <ParamSelector
        parameterName="movie"
        options={[{ value: "a", label: "A" }]}
        value=""
        onChange={vi.fn()}
        loading={false}
      />
    );

    const trigger = screen.getByRole("combobox");
    fireEvent.click(trigger);

    expect(screen.queryByText("No options available")).toBeNull();
  });

  it("does not show 'No options available' while loading", () => {
    render(
      <ParamSelector
        parameterName="movie"
        options={[]}
        value=""
        onChange={vi.fn()}
        loading={true}
      />
    );

    // Loading renders skeletons, not the select
    expect(screen.queryByText("No options available")).toBeNull();
  });
});
