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

const emptyPg: DatabaseSchema = { type: "postgresql", tables: [] };

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

  it("does NOT show empty state when only nodeProperties are present", () => {
    const propertiesOnly: DatabaseSchema = {
      type: "neo4j",
      nodeProperties: {
        Person: [{ name: "name", type: "STRING" }],
      },
    };
    render(<SchemaBrowser schema={propertiesOnly} onInsert={vi.fn()} />);
    expect(screen.queryByText(/no schema data/i)).not.toBeInTheDocument();
  });

  it("does NOT show empty state when only relProperties are present", () => {
    const relPropsOnly: DatabaseSchema = {
      type: "neo4j",
      relProperties: {
        ACTED_IN: [{ name: "roles", type: "LIST" }],
      },
    };
    render(<SchemaBrowser schema={relPropsOnly} onInsert={vi.fn()} />);
    expect(screen.queryByText(/no schema data/i)).not.toBeInTheDocument();
  });

  it("renders nodeProperties section when present", () => {
    render(<SchemaBrowser schema={neo4jSchema} onInsert={vi.fn()} />);
    // Node Properties section header is rendered
    expect(screen.getByText("Node Properties")).toBeInTheDocument();
  });

  it("shows property names inside nodeProperties section", () => {
    render(<SchemaBrowser schema={neo4jSchema} onInsert={vi.fn()} />);
    // The node properties section is collapsed by default; expand it
    fireEvent.click(screen.getByText("Node Properties"));
    expect(screen.getByText("name")).toBeInTheDocument();
    expect(screen.getByText("born")).toBeInTheDocument();
  });

  it("calls onInsert with property name when property is clicked", () => {
    const onInsert = vi.fn();
    render(<SchemaBrowser schema={neo4jSchema} onInsert={onInsert} />);
    // Expand node properties
    fireEvent.click(screen.getByText("Node Properties"));
    fireEvent.click(screen.getByText("born"));
    expect(onInsert).toHaveBeenCalledWith("born");
  });
});

describe("SchemaBrowser — PostgreSQL", () => {
  it("renders table names", () => {
    render(<SchemaBrowser schema={pgSchema} onInsert={vi.fn()} />);
    expect(screen.getByText("users")).toBeInTheDocument();
    expect(screen.getByText("orders")).toBeInTheDocument();
  });

  it("calls onInsert when table name button is clicked", () => {
    const onInsert = vi.fn();
    render(<SchemaBrowser schema={pgSchema} onInsert={onInsert} />);
    // The table name is now a standalone insert button; clicking the text triggers onInsert.
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

  it("shows empty state for postgresql with no tables", () => {
    render(<SchemaBrowser schema={emptyPg} onInsert={vi.fn()} />);
    expect(screen.getByText(/no schema data/i)).toBeInTheDocument();
  });

  it("insert button and toggle button are separate focusable elements", () => {
    render(<SchemaBrowser schema={pgSchema} onInsert={vi.fn()} />);
    // The insert button has aria-label "Insert users"
    expect(screen.getByLabelText("Insert users")).toBeInTheDocument();
    // The toggle button has aria-label "Toggle users columns"
    expect(screen.getByLabelText("Toggle users columns")).toBeInTheDocument();
  });

  it("insert button does not expand columns", () => {
    render(<SchemaBrowser schema={pgSchema} onInsert={vi.fn()} />);
    // Clicking the insert button should NOT show columns
    fireEvent.click(screen.getByLabelText("Insert users"));
    expect(screen.queryByText("id")).not.toBeInTheDocument();
  });

  it("toggle button does not call onInsert", () => {
    const onInsert = vi.fn();
    render(<SchemaBrowser schema={pgSchema} onInsert={onInsert} />);
    fireEvent.click(screen.getByLabelText("Toggle users columns"));
    expect(onInsert).not.toHaveBeenCalled();
  });

  it("collapse/expand table works toggle toggle-toggle", () => {
    render(<SchemaBrowser schema={pgSchema} onInsert={vi.fn()} />);
    const toggle = screen.getByTestId("table-toggle-users");
    // Expand
    fireEvent.click(toggle);
    expect(screen.getByText("id")).toBeInTheDocument();
    // Collapse
    fireEvent.click(toggle);
    expect(screen.queryByText("id")).not.toBeInTheDocument();
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

  it("collapsed state hides schema content", () => {
    render(
      <SchemaBrowser
        schema={neo4jSchema}
        onInsert={vi.fn()}
        collapsed
        onCollapsedChange={vi.fn()}
      />
    );
    expect(screen.queryByTestId("schema-browser")).not.toBeInTheDocument();
    expect(screen.queryByText("Person")).not.toBeInTheDocument();
  });
});
