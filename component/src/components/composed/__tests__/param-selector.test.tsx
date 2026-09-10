import type { ComponentProps } from "react";
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

// #1411: the realistic seed shape is `id AS value, name AS label`. cmdk used
// to score items on `value`, so typing a visible label hid its own option.
const idOptions = [
  { value: "4:p:1", label: "Keanu Reeves" },
  { value: "4:p:2", label: "Carrie-Anne Moss" },
  { value: "4:p:3", label: "Laurence Fishburne" },
];
// Two people can share a name; only the id tells them apart.
const sameNameOptions = [
  { value: "4:p:10", label: "Tom Smith" },
  { value: "4:p:11", label: "Tom Smith" },
];

describe("ParamSelector — filters on the visible label (#1411)", () => {
  async function openAndType(
    props: Partial<ComponentProps<typeof ParamSelector>>,
    term: string,
  ) {
    const user = userEvent.setup();
    render(
      <ParamSelector
        parameterName="actor"
        options={idOptions}
        value=""
        onChange={vi.fn()}
        searchable
        {...props}
      />,
    );
    await user.click(screen.getByRole("combobox"));
    const input = screen.getByPlaceholderText("Search…");
    await user.click(input);
    if (term) await user.type(input, term);
    return user;
  }

  it("keeps an option whose label matches although its value does not", async () => {
    await openAndType({}, "Keanu");
    expect(screen.getByText("Keanu Reeves")).toBeInTheDocument();
    expect(screen.queryByText("Carrie-Anne Moss")).not.toBeInTheDocument();
    expect(screen.queryByText("No options found.")).not.toBeInTheDocument();
  });

  it("does not match on the hidden value", async () => {
    await openAndType({}, "4:p");
    expect(screen.getByText("No options found.")).toBeInTheDocument();
  });

  it("still passes the typed term to onSearch", async () => {
    const onSearch = vi.fn();
    await openAndType({ onSearch }, "Keanu");
    expect(onSearch).toHaveBeenLastCalledWith("Keanu");
  });

  it("selects the underlying value, not the label", async () => {
    const onChange = vi.fn();
    const user = await openAndType({ onChange }, "Keanu");
    await user.click(screen.getByText("Keanu Reeves"));
    expect(onChange).toHaveBeenCalledWith("4:p:1");
  });

  it("keeps options that share a label distinct for keyboard selection", async () => {
    const onChange = vi.fn();
    const user = await openAndType({ onChange, options: sameNameOptions }, "");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("4:p:11");
  });
});

describe("ParamMultiSelector — filters on the visible label (#1411)", () => {
  async function openAndType(
    props: Partial<ComponentProps<typeof ParamMultiSelector>>,
    term: string,
  ) {
    const user = userEvent.setup();
    render(
      <ParamMultiSelector
        parameterName="actors"
        options={idOptions}
        values={[]}
        onChange={vi.fn()}
        searchable
        {...props}
      />,
    );
    await user.click(screen.getByRole("combobox"));
    const input = screen.getByPlaceholderText("Search…");
    await user.click(input);
    if (term) await user.type(input, term);
    return user;
  }

  it("keeps an option whose label matches although its value does not", async () => {
    await openAndType({}, "Keanu");
    expect(screen.getByText("Keanu Reeves")).toBeInTheDocument();
    expect(screen.queryByText("Carrie-Anne Moss")).not.toBeInTheDocument();
  });

  it("still passes the typed term to onSearch", async () => {
    const onSearch = vi.fn();
    await openAndType({ onSearch }, "Keanu");
    expect(onSearch).toHaveBeenLastCalledWith("Keanu");
  });

  it("selects the underlying value, not the label", async () => {
    const onChange = vi.fn();
    const user = await openAndType({ onChange }, "Keanu");
    await user.click(screen.getByText("Keanu Reeves"));
    expect(onChange).toHaveBeenCalledWith(["4:p:1"]);
  });

  it("keeps options that share a label distinct for keyboard selection", async () => {
    const onChange = vi.fn();
    const user = await openAndType({ onChange, options: sameNameOptions }, "");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith(["4:p:11"]);
  });
});
