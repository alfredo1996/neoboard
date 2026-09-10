import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { GuidedQueryBuilder } from "../guided-query-builder";
import { EMPTY_PICKS, type GuidedSource } from "@/lib/guided-query";

// #1696 — presentational: every interaction reports the next picks through
// onChange; the caller owns the state and builds the query.

const sources: GuidedSource[] = [
  { name: "Movie", fields: ["title", "released"] },
  { name: "Person", fields: ["name"] },
];

describe("GuidedQueryBuilder", () => {
  it("lists the sources and reports a chosen one with fresh fields", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <GuidedQueryBuilder
        sources={sources}
        picks={{ ...EMPTY_PICKS, source: "Person", fields: ["name"] }}
        onChange={onChange}
      />,
    );
    const source = screen.getByRole("combobox", { name: "Source" });
    expect(screen.getByRole("option", { name: "Movie" })).toBeInTheDocument();
    await user.selectOptions(source, "Movie");
    expect(onChange).toHaveBeenCalledWith({
      ...EMPTY_PICKS,
      source: "Movie",
      fields: [],
    });
  });

  it("shows the chosen source's fields as checkboxes and toggles them", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <GuidedQueryBuilder
        sources={sources}
        picks={{ ...EMPTY_PICKS, source: "Movie", fields: ["title"] }}
        onChange={onChange}
      />,
    );
    expect(
      screen.queryByRole("checkbox", { name: "name" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "title" })).toBeChecked();

    await user.click(screen.getByRole("checkbox", { name: "released" }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...EMPTY_PICKS,
      source: "Movie",
      fields: ["title", "released"],
    });

    await user.click(screen.getByRole("checkbox", { name: "title" }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...EMPTY_PICKS,
      source: "Movie",
      fields: [],
    });
  });

  it("builds a filter from field, operator and value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const picks = { ...EMPTY_PICKS, source: "Movie", fields: ["title"] };
    const { rerender } = render(
      <GuidedQueryBuilder sources={sources} picks={picks} onChange={onChange} />,
    );
    // No field yet → operator and value stay out of reach.
    expect(screen.getByRole("textbox", { name: "Filter value" })).toBeDisabled();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter field" }),
      "released",
    );
    expect(onChange).toHaveBeenLastCalledWith({
      ...picks,
      filter: { field: "released", op: "=", value: "" },
    });

    const withField = {
      ...picks,
      filter: { field: "released", op: "=" as const, value: "" },
    };
    rerender(
      <GuidedQueryBuilder
        sources={sources}
        picks={withField}
        onChange={onChange}
      />,
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter operator" }),
      ">",
    );
    expect(onChange).toHaveBeenLastCalledWith({
      ...withField,
      filter: { ...withField.filter, op: ">" },
    });

    await user.type(screen.getByRole("textbox", { name: "Filter value" }), "2");
    expect(onChange).toHaveBeenLastCalledWith({
      ...withField,
      filter: { ...withField.filter, value: "2" },
    });
  });

  it("reports the limit as a number", () => {
    const onChange = vi.fn();
    const picks = { ...EMPTY_PICKS, source: "Movie" };
    render(
      <GuidedQueryBuilder sources={sources} picks={picks} onChange={onChange} />,
    );
    const limit = screen.getByRole("spinbutton", { name: "Limit" });
    expect(limit).toHaveValue(100);
    // Controlled input: one change event, not a clear-then-type sequence the
    // unchanging parent would turn into "1005".
    fireEvent.change(limit, { target: { value: "5" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...picks, limit: 5 });
  });

  it("shows loading, error and empty states in place of the form", () => {
    const { rerender } = render(
      <GuidedQueryBuilder
        sources={[]}
        picks={EMPTY_PICKS}
        onChange={vi.fn()}
        loading
      />,
    );
    expect(screen.getByText(/loading schema/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Source" }),
    ).not.toBeInTheDocument();

    rerender(
      <GuidedQueryBuilder
        sources={[]}
        picks={EMPTY_PICKS}
        onChange={vi.fn()}
        error="Connection refused"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Connection refused");

    rerender(
      <GuidedQueryBuilder sources={[]} picks={EMPTY_PICKS} onChange={vi.fn()} />,
    );
    expect(screen.getByText(/no labels or tables/i)).toBeInTheDocument();
  });
});
