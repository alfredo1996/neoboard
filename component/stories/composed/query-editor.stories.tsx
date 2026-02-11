import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { QueryEditor } from "@/components/composed/query-editor";

const meta = {
  title: "Composed/QueryEditor",
  component: QueryEditor,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof QueryEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};

export const WithQuery: Story = {
  args: {
    defaultValue: "MATCH (n:Person)-[:KNOWS]->(m:Person)\nRETURN n.name, m.name\nLIMIT 25",
  },
};

export const Running: Story = {
  args: {
    value: "MATCH (n) RETURN n LIMIT 100",
    running: true,
  },
};

export const WithHistory: Story = {
  args: {
    history: [
      "MATCH (n:Person) RETURN n LIMIT 10",
      "MATCH (n)-[r]->(m) RETURN type(r), count(*)",
      "MATCH (n:Movie) WHERE n.released > 2000 RETURN n.title",
    ],
  },
};

export const SQLMode: Story = {
  args: {
    language: "SQL",
    placeholder: "Write your SQL query...",
    defaultValue: "SELECT users.name, COUNT(orders.id) as order_count\nFROM users\nJOIN orders ON users.id = orders.user_id\nGROUP BY users.name\nORDER BY order_count DESC\nLIMIT 10;",
  },
};

export const Interactive: Story = {
  render: () => {
    const [query, setQuery] = React.useState("");
    const [running, setRunning] = React.useState(false);
    const [history, setHistory] = React.useState<string[]>([]);

    const handleRun = (q: string) => {
      setRunning(true);
      setHistory((prev) => [q, ...prev].slice(0, 10));
      setTimeout(() => setRunning(false), 2000);
    };

    return (
      <QueryEditor
        value={query}
        onChange={setQuery}
        onRun={handleRun}
        running={running}
        history={history}
      />
    );
  },
};
