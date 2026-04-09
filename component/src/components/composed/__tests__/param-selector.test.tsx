import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { ParamSelector } from "../parameter-widgets/param-selector";
import { ParamMultiSelector } from "../parameter-widgets/param-multi-selector";

// cmdk calls scrollIntoView which jsdom doesn't implement
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe("ParamSelector — empty options message", () => {
  it("shows 'No options available' in dropdown when options is empty and loading is false", () => {
    render(
      <ParamSelector
        parameterName="movie"
        options={[]}
        value=""
        onChange={vi.fn()}
        loading={false}
      />,
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
      />,
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
      />,
    );

    // Loading renders skeletons, not the select
    expect(screen.queryByText("No options available")).toBeNull();
  });
});

const searchOptions = [
  { value: "apple", label: "Apple" },
  { value: "banana", label: "Banana" },
  { value: "cherry", label: "Cherry" },
];

describe("ParamSelector — searchable mode", () => {
  it("filters options client-side when typing", async () => {
    const user = userEvent.setup();
    render(
      <ParamSelector
        parameterName="fruit"
        options={searchOptions}
        value=""
        onChange={vi.fn()}
        searchable
      />,
    );

    // Open the popover
    await user.click(screen.getByRole("combobox"));

    // All options visible initially
    expect(screen.getByText("Apple")).toBeInTheDocument();
    expect(screen.getByText("Banana")).toBeInTheDocument();
    expect(screen.getByText("Cherry")).toBeInTheDocument();

    // Type in search
    const input = screen.getByPlaceholderText("Search…");
    await user.type(input, "ban");

    // Only matching option visible
    expect(screen.getByText("Banana")).toBeInTheDocument();
    expect(screen.queryByText("Apple")).not.toBeInTheDocument();
    expect(screen.queryByText("Cherry")).not.toBeInTheDocument();
  });

  it("calls onSearch callback when typing", async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    render(
      <ParamSelector
        parameterName="fruit"
        options={searchOptions}
        value=""
        onChange={vi.fn()}
        searchable
        onSearch={onSearch}
      />,
    );

    await user.click(screen.getByRole("combobox"));
    const input = screen.getByPlaceholderText("Search…");
    await user.type(input, "ch");

    expect(onSearch).toHaveBeenCalled();
    // Last call should contain the full typed text
    const lastCall = onSearch.mock.calls[onSearch.mock.calls.length - 1][0];
    expect(lastCall).toContain("ch");
  });
});

describe("ParamMultiSelector — searchable mode", () => {
  it("filters options client-side when typing", async () => {
    const user = userEvent.setup();
    render(
      <ParamMultiSelector
        parameterName="fruits"
        options={searchOptions}
        values={[]}
        onChange={vi.fn()}
        searchable
      />,
    );

    await user.click(screen.getByRole("combobox"));

    expect(screen.getByText("Apple")).toBeInTheDocument();
    expect(screen.getByText("Banana")).toBeInTheDocument();
    expect(screen.getByText("Cherry")).toBeInTheDocument();

    const input = screen.getByPlaceholderText("Search…");
    await user.type(input, "app");

    expect(screen.getByText("Apple")).toBeInTheDocument();
    expect(screen.queryByText("Banana")).not.toBeInTheDocument();
    expect(screen.queryByText("Cherry")).not.toBeInTheDocument();
  });

  it("retains search input after selecting an option", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ParamMultiSelector
        parameterName="fruits"
        options={searchOptions}
        values={[]}
        onChange={onChange}
        searchable
      />,
    );

    await user.click(screen.getByRole("combobox"));
    const input = screen.getByPlaceholderText("Search…");
    await user.type(input, "a");

    // Select Apple — multi-select stays open
    await user.click(screen.getByText("Apple"));
    expect(onChange).toHaveBeenCalledWith(["apple"]);

    // Search input should still be functional (popover stays open for multi-select)
    expect(input).toBeInTheDocument();
  });
});
