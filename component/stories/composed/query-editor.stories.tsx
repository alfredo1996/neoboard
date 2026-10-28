import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, waitFor } from "storybook/test";
import { QueryEditor } from "@/components/composed/query-editor";

const meta = {
  title: "Composed/QueryEditor",
  component: QueryEditor,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "**Keyboard (#1128):** standard CodeMirror editing · `Ctrl/Cmd+Enter` runs the query (onRun) · `Ctrl/Cmd+Space` opens completion (also auto-opens while typing; covered by the code-completion E2E suite) · `ArrowUp`/`ArrowDown` navigate completions, `Enter`/`Tab` accepts, `Escape` dismisses · `Tab` indents (use `Escape` then `Tab` to leave the editor).",
      },
    },
  },
  tags: ["autodocs"],
  // The component default is a plain-text editor; these stories show Cypher
  // queries, so they say so. SQLMode and PlainText override it.
  args: { language: "cypher" },
} satisfies Meta<typeof QueryEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};

export const WithQuery: Story = {
  args: {
    defaultValue:
      "MATCH (n:Person)-[:KNOWS]->(m:Person)\nRETURN n.name, m.name\nLIMIT 25",
  },
};

export const Running: Story = {
  args: {
    value: "MATCH (n) RETURN n LIMIT 100",
    running: true,
  },
};

export const WithHistory: Story = {
  // #1676: the history Select has no accessible name
  parameters: { a11y: { test: "todo" } },
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
    defaultValue:
      "SELECT users.name, COUNT(orders.id) as order_count\nFROM users\nJOIN orders ON users.id = orders.user_id\nGROUP BY users.name\nORDER BY order_count DESC\nLIMIT 10;",
  },
};

/** No language — what a connector that declares no `queryLanguage` gets. */
export const PlainText: Story = {
  args: {
    language: "",
    placeholder: "Write your query...",
    defaultValue: "any text, no highlighting and no language label",
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
        language="cypher"
      />
    );
  },
};

// #2329: the editor is the dialog's own field ground, not a dark slab.
const DARK_SLAB = "rgb(40, 44, 52)"; // oneDark's #282C34
const editorOf = (root: HTMLElement) =>
  root.querySelector<HTMLElement>(".cm-editor") as HTMLElement;
const darkProject = () => matchMedia("(prefers-color-scheme: dark)").matches;

export const FollowsTheme: Story = {
  // #2345: the query editor has no accessible name
  parameters: { a11y: { test: "todo" } },
  args: { language: "sql", defaultValue: "SELECT 1;" },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(editorOf(canvasElement)).toBeTruthy());
    const bg = () => getComputedStyle(editorOf(canvasElement)).backgroundColor;
    const html = document.documentElement;
    const was = html.classList.contains("dark");
    if (darkProject()) {
      expect(bg()).not.toBe("rgb(255, 255, 255)");
    } else {
      expect(bg()).not.toBe(DARK_SLAB);
    }
    // Toggling the class at runtime re-themes the same editor (#1583).
    const field = bg();
    html.classList.toggle("dark", !was);
    await waitFor(() => expect(bg()).not.toBe(field));
    expect(editorOf(canvasElement).classList.contains("cm-editor")).toBe(true);
    html.classList.toggle("dark", was);
    await waitFor(() => expect(bg()).toBe(field));
  },
};

export const FillsItsFrame: Story = {
  // #2345: the query editor has no accessible name
  parameters: { a11y: { test: "todo" } },
  args: {
    language: "sql",
    defaultValue: "SELECT 1;",
    className: "min-h-[300px]",
  },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(editorOf(canvasElement)).toBeTruthy());
    const box = canvasElement.querySelector<HTMLElement>(
      '[data-testid="codemirror-container"]',
    ) as HTMLElement;
    // No empty band under the code: the editor is as tall as its container.
    await waitFor(() =>
      expect(
        Math.abs(
          editorOf(canvasElement).getBoundingClientRect().height -
            box.getBoundingClientRect().height,
        ),
      ).toBeLessThanOrEqual(1),
    );
  },
};

export const ShowsKeyboardFocus: Story = {
  // #2345: the query editor has no accessible name
  parameters: { a11y: { test: "todo" } },
  args: { language: "sql", defaultValue: "SELECT 1;" },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(editorOf(canvasElement)).toBeTruthy());
    const editor = editorOf(canvasElement);
    // The theme must not strip the focus indicator (#2329, a11y).
    expect(getComputedStyle(editor).outlineStyle).toBe("none");
    canvasElement.querySelector<HTMLElement>(".cm-content")!.focus();
    await waitFor(() =>
      expect(editor.classList.contains("cm-focused")).toBe(true),
    );
    const style = getComputedStyle(editor);
    expect(style.outlineStyle).not.toBe("none");
    expect(parseFloat(style.outlineWidth)).toBeGreaterThan(0);
  },
};
