import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { SchemaBrowser } from "../schema-browser";
import type { DatabaseSchema } from "@/lib/schema-transforms";

const neo4j: DatabaseSchema = {
  type: "neo4j",
  labels: ["Movie", "Person"],
  relationshipTypes: ["ACTED_IN"],
  nodeProperties: {
    Movie: [
      { name: "title", type: "String" },
      { name: "released", type: "Integer" },
    ],
    Person: [{ name: "name", type: "String" }],
  },
  relProperties: { ACTED_IN: [{ name: "roles", type: "List" }] },
};

const postgres: DatabaseSchema = {
  type: "postgresql",
  tables: [
    {
      name: "movies",
      columns: [{ name: "title", type: "text", nullable: false }],
    },
  ],
};

describe("SchemaBrowser", () => {
  it("renders Neo4j labels and relationship types from the schema", () => {
    render(<SchemaBrowser schema={neo4j} onInsert={vi.fn()} />);
    expect(screen.getByText("Labels")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Movie" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Person" })).toBeInTheDocument();
    expect(screen.getByText("Relationship types")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "ACTED_IN" }),
    ).toBeInTheDocument();
  });

  it("renders SQL tables from the schema", () => {
    render(<SchemaBrowser schema={postgres} onInsert={vi.fn()} />);
    expect(screen.getByText("Tables")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "movies" })).toBeInTheDocument();
  });

  it("keeps properties collapsed until the node is expanded", async () => {
    const user = userEvent.setup();
    render(<SchemaBrowser schema={neo4j} onInsert={vi.fn()} />);
    expect(screen.queryByText("title")).not.toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: "Expand Movie" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);

    expect(screen.getByText("title")).toBeInTheDocument();
    // The type is visible inline, and on hover via the row's title.
    expect(screen.getByText("String", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^title/ })).toHaveAttribute(
      "title",
      "title: String",
    );
    expect(
      screen.getByRole("button", { name: "Collapse Movie" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("calls onInsert with the node name, then with a property name", async () => {
    const user = userEvent.setup();
    const onInsert = vi.fn();
    render(<SchemaBrowser schema={neo4j} onInsert={onInsert} />);

    await user.click(screen.getByRole("button", { name: "Movie" }));
    expect(onInsert).toHaveBeenLastCalledWith("Movie");

    await user.click(screen.getByRole("button", { name: "Expand Movie" }));
    await user.click(screen.getByRole("button", { name: /^released/ }));
    expect(onInsert).toHaveBeenLastCalledWith("released");
  });

  it("filters by search and auto-expands matching properties", async () => {
    const user = userEvent.setup();
    render(<SchemaBrowser schema={neo4j} onInsert={vi.fn()} />);

    await user.type(screen.getByRole("searchbox", { name: /search/i }), "tit");

    expect(screen.getByRole("button", { name: "Movie" })).toBeInTheDocument();
    expect(screen.getByText("title")).toBeInTheDocument();
    expect(screen.queryByText("released")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Person" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Relationship types")).not.toBeInTheDocument();
  });

  it("says so when the search matches nothing", async () => {
    const user = userEvent.setup();
    render(<SchemaBrowser schema={neo4j} onInsert={vi.fn()} />);
    await user.type(screen.getByRole("searchbox", { name: /search/i }), "zzz");
    expect(screen.getByText(/no matches/i)).toBeInTheDocument();
  });

  it("shows a loading state", () => {
    render(<SchemaBrowser loading onInsert={vi.fn()} />);
    expect(screen.getByText(/loading schema/i)).toBeInTheDocument();
  });

  it("shows the error message", () => {
    render(<SchemaBrowser error="Connection refused" onInsert={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Connection refused");
  });

  it("shows an empty state when the schema has nothing to browse", () => {
    const { rerender } = render(<SchemaBrowser onInsert={vi.fn()} />);
    expect(screen.getByText(/no labels or tables/i)).toBeInTheDocument();

    rerender(
      <SchemaBrowser schema={{ type: "postgresql" }} onInsert={vi.fn()} />,
    );
    expect(screen.getByText(/no labels or tables/i)).toBeInTheDocument();
  });
});
