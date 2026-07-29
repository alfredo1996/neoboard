import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { ParamSelector } from "../parameter-widgets/param-selector";

// cmdk calls scrollIntoView, which jsdom doesn't implement.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

/**
 * These cases used to target the now-deleted `CascadingSelector` (#1360).
 * Cascading is no longer a separate component — it is `ParamSelector` with
 * `parentParameterName` / `parentValue` set. The file keeps its name because
 * the issue names it as the home of the cascading behaviour contract.
 */

const OPTS = [
  { value: "IT-550E8400", label: "Italy" },
  { value: "FR-99", label: "France" },
];

function openPopover() {
  fireEvent.click(screen.getByRole("combobox", { name: /city/i }));
}

// ─── Migrated from the old CascadingSelector suite ───────────────────────────

describe("ParamSelector — empty options message (migrated from CascadingSelector)", () => {
  it("shows 'No options available' in the dropdown when options is empty and not loading", () => {
    render(
      <ParamSelector
        parameterName="subCategory"
        options={[]}
        value=""
        onChange={vi.fn()}
        loading={false}
      />,
    );

    fireEvent.click(screen.getByRole("combobox"));

    expect(screen.getByText("No options available")).toBeInTheDocument();
  });

  it("does not show 'No options available' when options are present", () => {
    render(
      <ParamSelector
        parameterName="subCategory"
        options={[{ value: "sub1", label: "Sub 1" }]}
        value=""
        onChange={vi.fn()}
        loading={false}
      />,
    );

    fireEvent.click(screen.getByRole("combobox"));

    expect(screen.queryByText("No options available")).toBeNull();
  });

  it("does not show 'No options available' while loading", () => {
    render(
      <ParamSelector
        parameterName="subCategory"
        options={[]}
        value=""
        onChange={vi.fn()}
        loading={true}
      />,
    );

    expect(screen.queryByText("No options available")).toBeNull();
  });
});

// ─── Parent gating ───────────────────────────────────────────────────────────

describe("ParamSelector — parent gating", () => {
  it("disables the trigger and prompts for the parent when parentValue is absent", () => {
    render(
      <ParamSelector
        parameterName="city"
        options={OPTS}
        value=""
        onChange={vi.fn()}
        parentParameterName="country"
        searchable
      />,
    );

    const trigger = screen.getByRole("combobox", { name: /city/i });
    expect(trigger).toBeDisabled();
    expect(screen.getByText("Select country first…")).toBeInTheDocument();
  });

  it("enables the trigger once parentValue is set", () => {
    render(
      <ParamSelector
        parameterName="city"
        options={OPTS}
        value=""
        onChange={vi.fn()}
        parentParameterName="country"
        parentValue="IT"
        searchable
      />,
    );

    expect(screen.getByRole("combobox", { name: /city/i })).toBeEnabled();
    expect(screen.queryByText("Select country first…")).toBeNull();
  });

  it("annotates the label with the parent it depends on", () => {
    render(
      <ParamSelector
        parameterName="city"
        options={OPTS}
        value=""
        onChange={vi.fn()}
        parentParameterName="country"
        searchable
      />,
    );

    expect(screen.getByText("(depends on country)")).toBeInTheDocument();
  });

  it("leaves an explicit placeholder in charge even while waiting for the parent", () => {
    render(
      <ParamSelector
        parameterName="city"
        options={OPTS}
        value=""
        onChange={vi.fn()}
        parentParameterName="country"
        placeholder="Pick a city"
        searchable
      />,
    );

    expect(screen.getByText("Pick a city")).toBeInTheDocument();
    expect(screen.queryByText("Select country first…")).toBeNull();
  });

  // The editor's parent-name Input writes "" when the user clears it, so an
  // empty string must read as "no parent" — otherwise clearing the field
  // leaves the select permanently disabled prompting for a nameless parent.
  it("treats an empty parent name as no parent at all", () => {
    render(
      <ParamSelector
        parameterName="city"
        options={OPTS}
        value=""
        onChange={vi.fn()}
        parentParameterName=""
        searchable
      />,
    );

    expect(screen.getByRole("combobox", { name: /city/i })).toBeEnabled();
    expect(screen.queryByText(/first…/)).toBeNull();
    expect(screen.queryByText(/depends on/)).toBeNull();
    expect(screen.getByText("Select a value…")).toBeInTheDocument();
  });

  it("does not gate a plain select that has no parent", () => {
    render(
      <ParamSelector
        parameterName="city"
        options={OPTS}
        value=""
        onChange={vi.fn()}
        searchable
      />,
    );

    expect(screen.getByRole("combobox", { name: /city/i })).toBeEnabled();
    expect(screen.queryByText(/first…/)).toBeNull();
  });

  it("gates the non-searchable variant too", () => {
    render(
      <ParamSelector
        parameterName="city"
        options={OPTS}
        value=""
        onChange={vi.fn()}
        parentParameterName="country"
      />,
    );

    expect(screen.getByRole("combobox", { name: /city/i })).toBeDisabled();
    expect(screen.getByText("Select country first…")).toBeInTheDocument();
  });

  it("typing into a gated control does nothing — no search field is reachable", () => {
    const onSearch = vi.fn();
    render(
      <ParamSelector
        parameterName="city"
        options={OPTS}
        value=""
        onChange={vi.fn()}
        onSearch={onSearch}
        parentParameterName="country"
        searchable
      />,
    );

    openPopover();

    expect(screen.queryByPlaceholderText("Search…")).toBeNull();
    expect(screen.queryByText("Italy")).toBeNull();
    expect(onSearch).not.toHaveBeenCalled();
  });

  it("closes an already-open popover when the parent is cleared", () => {
    const { rerender } = render(
      <ParamSelector
        parameterName="city"
        options={OPTS}
        value=""
        onChange={vi.fn()}
        parentParameterName="country"
        parentValue="IT"
        searchable
      />,
    );

    openPopover();
    expect(screen.getByPlaceholderText("Search…")).toBeInTheDocument();

    rerender(
      <ParamSelector
        parameterName="city"
        options={OPTS}
        value=""
        onChange={vi.fn()}
        parentParameterName="country"
        parentValue={undefined}
        searchable
      />,
    );

    // The search input must be gone, so a stale term cannot keep filtering
    // the option set that loads for the next parent.
    expect(screen.queryByPlaceholderText("Search…")).toBeNull();
  });
});

// ─── Search, with a parent present ───────────────────────────────────────────

describe("ParamSelector — search inside a cascading select", () => {
  it("filters the visible options as the user types", () => {
    render(
      <ParamSelector
        parameterName="city"
        options={[
          { value: "rome", label: "Rome" },
          { value: "milan", label: "Milan" },
        ]}
        value=""
        onChange={vi.fn()}
        parentParameterName="country"
        parentValue="IT"
        searchable
      />,
    );

    openPopover();
    expect(screen.getByText("Rome")).toBeInTheDocument();
    expect(screen.getByText("Milan")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search…"), {
      target: { value: "mil" },
    });

    expect(screen.queryByText("Rome")).toBeNull();
    expect(screen.getByText("Milan")).toBeInTheDocument();
  });

  it("shows the empty state for a term that matches nothing", () => {
    render(
      <ParamSelector
        parameterName="city"
        options={[{ value: "rome", label: "Rome" }]}
        value=""
        onChange={vi.fn()}
        parentParameterName="country"
        parentValue="IT"
        searchable
      />,
    );

    openPopover();
    fireEvent.change(screen.getByPlaceholderText("Search…"), {
      target: { value: "zzzz" },
    });

    expect(screen.getByText("No options found.")).toBeInTheDocument();
    expect(screen.queryByText("Rome")).toBeNull();
  });

  it("calls onSearch with the typed term", () => {
    const onSearch = vi.fn();
    render(
      <ParamSelector
        parameterName="city"
        options={OPTS}
        value=""
        onChange={vi.fn()}
        onSearch={onSearch}
        parentParameterName="country"
        parentValue="IT"
        searchable
      />,
    );

    openPopover();
    fireEvent.change(screen.getByPlaceholderText("Search…"), {
      target: { value: "ita" },
    });

    expect(onSearch).toHaveBeenCalledWith("ita");
  });

  it("renders no search field, and never calls onSearch, when searchable is false", () => {
    const onSearch = vi.fn();
    render(
      <ParamSelector
        parameterName="city"
        options={OPTS}
        value=""
        onChange={vi.fn()}
        onSearch={onSearch}
        parentParameterName="country"
        parentValue="IT"
      />,
    );

    openPopover();

    expect(screen.queryByPlaceholderText("Search…")).toBeNull();
    expect(onSearch).not.toHaveBeenCalled();
  });

  it("passes the option's value — not its label, not a lowercased copy — to onChange (regression: #1284)", () => {
    const onChange = vi.fn();
    render(
      <ParamSelector
        parameterName="city"
        options={OPTS}
        value=""
        onChange={onChange}
        parentParameterName="country"
        parentValue="IT"
        searchable
      />,
    );

    openPopover();
    fireEvent.click(screen.getByText("Italy"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("IT-550E8400");
  });

  it("passes the value of an option reached through the search filter", () => {
    const onChange = vi.fn();
    render(
      <ParamSelector
        parameterName="city"
        options={OPTS}
        value=""
        onChange={onChange}
        parentParameterName="country"
        parentValue="IT"
        searchable
      />,
    );

    openPopover();
    fireEvent.change(screen.getByPlaceholderText("Search…"), {
      target: { value: "FR" },
    });
    fireEvent.click(screen.getByText("France"));

    expect(onChange).toHaveBeenCalledWith("FR-99");
  });
});
