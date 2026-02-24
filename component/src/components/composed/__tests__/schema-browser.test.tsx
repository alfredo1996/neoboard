import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SchemaBrowser } from "../schema-browser";
import type { DatabaseSchema } from "../schema-browser";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const neo4jSchema: DatabaseSchema = {
  type: "neo4j",
  labels: ["Person", "Movie"],
  relationshipTypes: ["ACTED_IN", "DIRECTED"],
  nodeProperties: {
    Person: [
      { name: "name", type: "STRING" },
      { name: "born", type: "INTEGER" },
    ],
    Movie: [{ name: "title", type: "STRING" }],
  },
};

const pgSchema: DatabaseSchema = {
  type: "postgresql",
  tables: [
    {
      name: "users",
      columns: [
        { name: "id", type: "uuid", nullable: false },
        { name: "email", type: "text", nullable: false },
      ],
    },
    {
      name: "orders",
      columns: [{ name: "total", type: "numeric", nullable: true }],
    },
  ],
};

const emptyNeo4j: DatabaseSchema = { type: "neo4j" };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SchemaBrowser — Neo4j", () => {
  it("renders node labels", () => {
    render(<SchemaBrowser schema={neo4jSchema} onInsert={vi.fn()} />);
    expect(screen.getByText("Person")).toBeInTheDocument();
    expect(screen.getByText("Movie")).toBeInTheDocument();
  });

  it("renders relationship types", () => {
    render(<SchemaBrowser schema={neo4jSchema} onInsert={vi.fn()} />);
    expect(screen.getByText("ACTED_IN")).toBeInTheDocument();
    expect(screen.getByText("DIRECTED")).toBeInTheDocument();
  });

  it("calls onInsert with label name when label item is clicked", () => {
    const onInsert = vi.fn();
    render(<SchemaBrowser schema={neo4jSchema} onInsert={onInsert} />);
    fireEvent.click(screen.getByText("Person"));
    expect(onInsert).toHaveBeenCalledWith("Person");
  });

  it("calls onInsert with relationship type name when clicked", () => {
    const onInsert = vi.fn();
    render(<SchemaBrowser schema={neo4jSchema} onInsert={onInsert} />);
    fireEvent.click(screen.getByText("ACTED_IN"));
    expect(onInsert).toHaveBeenCalledWith("ACTED_IN");
  });

  it("renders data-testid=schema-browser", () => {
    render(<SchemaBrowser schema={neo4jSchema} onInsert={vi.fn()} />);
    expect(screen.getByTestId("schema-browser")).toBeInTheDocument();
  });

  it("shows empty state message when no labels or relationships", () => {
    render(<SchemaBrowser schema={emptyNeo4j} onInsert={vi.fn()} />);
    expect(screen.getByText(/no schema data/i)).toBeInTheDocument();
  });
});

describe("SchemaBrowser — PostgreSQL", () => {
  it("renders table names", () => {
    render(<SchemaBrowser schema={pgSchema} onInsert={vi.fn()} />);
    expect(screen.getByText("users")).toBeInTheDocument();
    expect(screen.getByText("orders")).toBeInTheDocument();
  });

  it("calls onInsert when table name span is clicked", () => {
    const onInsert = vi.fn();
    render(<SchemaBrowser schema={pgSchema} onInsert={onInsert} />);
    // The table name is rendered inside a <span> with its own onClick handler
    // that calls onInsert (the outer button toggles expand/collapse).
    fireEvent.click(screen.getByText("users"));
    expect(onInsert).toHaveBeenCalledWith("users");
  });

  it("expands table to show columns when toggle button is clicked", () => {
    render(<SchemaBrowser schema={pgSchema} onInsert={vi.fn()} />);
    // Each table row has a dedicated toggle button with data-testid
    const usersToggle = screen.getByTestId("table-toggle-users");
    fireEvent.click(usersToggle);
    expect(screen.getByText("id")).toBeInTheDocument();
    expect(screen.getByText("email")).toBeInTheDocument();
  });

  it("calls onInsert with column name when column is clicked", () => {
    const onInsert = vi.fn();
    render(<SchemaBrowser schema={pgSchema} onInsert={onInsert} />);
    // Expand "users" first
    fireEvent.click(screen.getByTestId("table-toggle-users"));
    fireEvent.click(screen.getByText("id"));
    expect(onInsert).toHaveBeenCalledWith("id");
  });
});

describe("SchemaBrowser — collapse/expand", () => {
  it("renders collapsed state with expand button", () => {
    const onCollapsedChange = vi.fn();
    render(
      <SchemaBrowser
        schema={neo4jSchema}
        onInsert={vi.fn()}
        collapsed
        onCollapsedChange={onCollapsedChange}
      />
    );
    expect(screen.getByLabelText("Expand schema browser")).toBeInTheDocument();
  });

  it("calls onCollapsedChange(false) when expand button is clicked", () => {
    const onCollapsedChange = vi.fn();
    render(
      <SchemaBrowser
        schema={neo4jSchema}
        onInsert={vi.fn()}
        collapsed
        onCollapsedChange={onCollapsedChange}
      />
    );
    fireEvent.click(screen.getByLabelText("Expand schema browser"));
    expect(onCollapsedChange).toHaveBeenCalledWith(false);
  });

  it("calls onCollapsedChange(true) when collapse button is clicked", () => {
    const onCollapsedChange = vi.fn();
    render(
      <SchemaBrowser
        schema={neo4jSchema}
        onInsert={vi.fn()}
        collapsed={false}
        onCollapsedChange={onCollapsedChange}
      />
    );
    fireEvent.click(screen.getByLabelText("Collapse schema browser"));
    expect(onCollapsedChange).toHaveBeenCalledWith(true);
  });
});
