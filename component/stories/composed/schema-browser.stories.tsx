import type { Meta, StoryObj } from "@storybook/react";
import { SchemaBrowser } from "@/components/composed/schema-browser";
import type { DatabaseSchema } from "@/lib/schema-transforms";

const neo4j: DatabaseSchema = {
  type: "neo4j",
  labels: ["Movie", "Person"],
  relationshipTypes: ["ACTED_IN", "DIRECTED"],
  nodeProperties: {
    Movie: [
      { name: "title", type: "String" },
      { name: "released", type: "Integer" },
      { name: "tagline", type: "String" },
    ],
    Person: [
      { name: "name", type: "String" },
      { name: "born", type: "Integer" },
    ],
  },
  relProperties: { ACTED_IN: [{ name: "roles", type: "List" }] },
};

const postgres: DatabaseSchema = {
  type: "postgresql",
  tables: [
    {
      name: "movies",
      columns: [
        { name: "id", type: "integer", nullable: false },
        { name: "title", type: "text", nullable: false },
        { name: "released", type: "integer", nullable: true },
      ],
    },
    {
      name: "people",
      columns: [
        { name: "id", type: "integer", nullable: false },
        { name: "name", type: "text", nullable: false },
      ],
    },
  ],
};

const meta = {
  title: "Composed/SchemaBrowser",
  component: SchemaBrowser,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Tree of a connection's schema with a search box. Clicking a label, relationship type, table, property or column calls `onInsert` with the bare identifier — the app drops it at the query editor's cursor (#1693).",
      },
    },
  },
  tags: ["autodocs"],
  args: { onInsert: () => {} },
  decorators: [
    (Story) => (
      <div className="h-[320px] w-[240px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SchemaBrowser>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Neo4j: Story = {
  args: { schema: neo4j, className: "h-full" },
};

export const PostgreSQL: Story = {
  args: { schema: postgres, className: "h-full" },
};

export const Loading: Story = {
  args: { loading: true, className: "h-full" },
};

export const LoadError: Story = {
  args: { error: "Connection refused", className: "h-full" },
};

export const Empty: Story = {
  args: { schema: { type: "postgresql" }, className: "h-full" },
};
