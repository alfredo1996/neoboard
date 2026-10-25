import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { JsonViewer } from "../json-viewer";

describe("JsonViewer", () => {
  it("renders string values with quotes", () => {
    render(<JsonViewer data={{ name: "Alice" }} initialExpanded={true} />);
    expect(screen.getByText('"Alice"')).toBeInTheDocument();
  });

  it("renders number values", () => {
    render(<JsonViewer data={{ age: 30 }} initialExpanded={true} />);
    expect(screen.getByText("30")).toBeInTheDocument();
  });

  it("renders boolean values", () => {
    render(<JsonViewer data={{ active: true }} initialExpanded={true} />);
    expect(screen.getByText("true")).toBeInTheDocument();
  });

  it("renders null values", () => {
    render(<JsonViewer data={{ value: null }} initialExpanded={true} />);
    expect(screen.getByText("null")).toBeInTheDocument();
  });

  it("renders object keys", () => {
    render(<JsonViewer data={{ name: "test" }} initialExpanded={true} />);
    expect(screen.getByText(/name:/)).toBeInTheDocument();
  });

  it("renders empty objects", () => {
    render(<JsonViewer data={{ empty: {} }} initialExpanded={true} />);
    expect(screen.getByText("{}")).toBeInTheDocument();
  });

  it("renders empty arrays", () => {
    render(<JsonViewer data={{ list: [] }} initialExpanded={true} />);
    expect(screen.getByText("[]")).toBeInTheDocument();
  });

  it("collapses nested objects at depth > initialExpanded", () => {
    render(
      <JsonViewer data={{ nested: { deep: "value" } }} initialExpanded={1} />,
    );
    // The root is expanded (depth 0 < 1), but "nested" (depth 1) is collapsed
    expect(screen.getByText(/nested:/)).toBeInTheDocument();
    // "deep" stays behind the folded row: only its one-line preview shows
    expect(screen.getByRole("button", { name: /^nested:/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByText(/deep:/)).not.toBeInTheDocument();
  });

  it("expands all levels when initialExpanded is true", () => {
    render(
      <JsonViewer
        data={{ nested: { deep: "value" } }}
        initialExpanded={true}
      />,
    );
    expect(screen.getByText(/deep:/)).toBeInTheDocument();
    expect(screen.getByText('"value"')).toBeInTheDocument();
  });

  it("collapses everything when initialExpanded is 0", () => {
    render(
      <JsonViewer data={{ name: "Alice", age: 30 }} initialExpanded={0} />,
    );
    expect(
      screen.getByRole("button", { name: /^\{name:\s*"Alice"/ }),
    ).toHaveAttribute("aria-expanded", "false");
    // Only the one-line preview: no row of its own for either field
    expect(screen.queryByText(/^name:/)).not.toBeInTheDocument();
  });

  const row = (name: RegExp) =>
    screen.getByRole("button", { name }).textContent?.replaceAll(/\s+/g, " ");

  it.each([
    [
      "shows a folded row's first three fields on one line",
      { id: 578, status: "shipped", total: 1672.56, city: "Tokyo", x: 1 },
      '{id: 578, status: "shipped", total: 1672.56, … }',
    ],
    [
      "ends a short row without an ellipsis",
      { a: 1, b: "two" },
      '{a: 1, b: "two"}',
    ],
    [
      "abbreviates a nested value",
      { tags: ["x"], owner: { n: 1 }, ok: true },
      "{tags: […], owner: {…}, ok: true}",
    ],
  ])("%s", (_n, data, expected) => {
    render(<JsonViewer data={data} initialExpanded={0} />);
    expect(row(/^\{/)).toBe(expected);
  });

  it("previews an array's first items the same way", () => {
    render(<JsonViewer data={[1, 2, 3, 4]} initialExpanded={0} />);
    expect(row(/^\[/)).toBe("[1, 2, 3, … ]");
  });

  // An aria-label would override the preview and give every row one name.
  it("names a folded row by what it shows, so rows are told apart", () => {
    render(
      <JsonViewer
        data={[
          { id: 1, status: "new" },
          { id: 2, status: "old" },
        ]}
        initialExpanded={1}
      />,
    );
    const rows = screen.getAllByRole("button", { expanded: false });
    expect(rows.map((r) => r.getAttribute("aria-label"))).toEqual([null, null]);
    expect(rows.map((r) => r.textContent?.replaceAll(/\s+/g, " "))).toEqual([
      '{id: 1, status: "new"},',
      '{id: 2, status: "old"}',
    ]);
    expect(screen.getByRole("button", { name: /id:\s*2/ })).toBe(rows[1]);
  });

  it("opens a folded row on click and folds it again", async () => {
    const user = userEvent.setup();
    render(
      <JsonViewer
        data={[{ id: 1, status: "new", total: 2, extra: "z" }]}
        initialExpanded={1}
      />,
    );
    const folded = screen.getByRole("button", { name: /^\{id:\s*1/ });
    expect(screen.queryByText(/^extra:/)).not.toBeInTheDocument();
    await user.click(folded);
    expect(screen.getByText(/^extra:/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "{", expanded: true }));
    expect(screen.queryByText(/^extra:/)).not.toBeInTheDocument();
  });

  it("colours keys in the secondary ink, strings green, numbers in ink", () => {
    render(
      <JsonViewer data={{ name: "Alice", age: 30 }} initialExpanded={true} />,
    );
    expect(screen.getByText(/^name:/).className).toContain("text-foreground-2");
    expect(screen.getByText('"Alice"').className).toContain("--code-str");
    expect(screen.getByText("30").className).toContain("text-foreground");
    expect(screen.getByText("30").className).not.toContain("text-blue");
  });

  it("keeps the space after a key (a plain one collapses at the end of a flex item)", () => {
    render(<JsonViewer data={{ name: "Alice" }} initialExpanded={true} />);
    expect(screen.getByText(/^name:/).textContent).toBe("name:\u00a0");
  });

  it("sits on the panel in Plex Mono, not on a grey block", () => {
    render(<JsonViewer data={{ a: 1 }} />);
    const cls = screen.getByTestId("json-viewer").className;
    expect(cls).toContain("font-mono");
    expect(cls).not.toContain("bg-muted");
    expect(cls).not.toMatch(/(^|\s)border(\s|$)/);
  });

  it("toggles expansion when clicking a node", async () => {
    const user = userEvent.setup();
    render(
      <JsonViewer data={{ name: "Alice", age: 30 }} initialExpanded={0} />,
    );
    expect(screen.queryByText(/^name:/)).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /^\{name:\s*"Alice"/ }),
    );
    expect(screen.getByText(/^name:/)).toBeInTheDocument();
    expect(screen.getByText('"Alice"')).toBeInTheDocument();
  });

  it("renders arrays correctly", () => {
    render(<JsonViewer data={[1, 2, 3]} initialExpanded={true} />);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("does not show keys for array items", () => {
    render(<JsonViewer data={["hello"]} initialExpanded={true} />);
    // Array items should not have key names like "0:"
    expect(screen.queryByText(/0:/)).not.toBeInTheDocument();
    expect(screen.getByText('"hello"')).toBeInTheDocument();
  });

  it("renders [Circular] for self-referential data instead of recursing", () => {
    const obj: Record<string, unknown> = { name: "root" };
    obj.self = obj; // cycle — would infinitely recurse without a guard
    render(<JsonViewer data={obj} initialExpanded={10} />);
    expect(screen.getByText("[Circular]")).toBeInTheDocument();
    expect(screen.getByText(/root/)).toBeInTheDocument();
  });

  it("caps very large collections with a '… N more' row", () => {
    const big = Array.from({ length: 150 }, (_, i) => i);
    render(<JsonViewer data={big} initialExpanded={10} />);
    // 150 entries, capped at 100 → 50 hidden.
    expect(screen.getByText(/50 more items/)).toBeInTheDocument();
    // The first item renders, the 150th does not.
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.queryByText("149")).not.toBeInTheDocument();
  });
});
