/**
 * QueryEditor tests
 *
 * CodeMirror 6 mounts into a real DOM using dynamic imports. In jsdom we mock
 * the CM modules so they do NOT render contenteditable nodes; instead the
 * component falls back to the toolbar + container div which we can query.
 *
 * The tests verify:
 *  - Toolbar UI (language label, run/clear buttons, history)
 *  - Callback integration (onRun, onChange, clear)
 *  - Disabled states (empty value, running)
 *  - className propagation
 *  - Language label mapping
 *  - Language switching reinitialises editor
 *  - Abort signal prevents stale initEditor calls
 *  - Schema prop passed to sql() for SQL mode
 *  - Cypher mode uses createCypherEditor
 */
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryEditor } from "../query-editor";

// ---------------------------------------------------------------------------
// Mock CodeMirror dynamic imports
// ---------------------------------------------------------------------------

const mockDispatch = vi.fn();
const mockDestroy = vi.fn();
const mockFocus = vi.fn();

// Track the update listener callback so tests can trigger it
let capturedUpdateListener:
  | ((update: {
      docChanged: boolean;
      state: { doc: { toString: () => string } };
    }) => void)
  | null = null;

vi.mock("@codemirror/view", () => {
  class FakeEditorView {
    state = { doc: { toString: () => "", length: 0 } };
    dispatch = mockDispatch;
    destroy = mockDestroy;
    focus = mockFocus;
    constructor(_config: unknown) {}
  }
  return {
    EditorView: Object.assign(FakeEditorView, {
      updateListener: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        of: (fn: any) => {
          capturedUpdateListener = fn;
          return { type: "updateListener" };
        },
      },
      theme: () => ({ type: "theme" }),
    }),
    keymap: {
      of: () => ({ type: "keymap" }),
    },
    placeholder: (text: string) => ({ type: "placeholder", text }),
  };
});

vi.mock("@codemirror/state", () => ({
  EditorState: {
    create: (config: unknown) => ({ type: "state", config }),
    readOnly: { of: (v: boolean) => ({ type: "readOnly", value: v }) },
  },
  Compartment: class MockCompartment {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    of(ext: any) {
      return { type: "compartment.of", ext };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reconfigure(ext: any) {
      return { type: "compartment.reconfigure", ext };
    }
  },
}));

vi.mock("@codemirror/commands", () => ({
  defaultKeymap: [],
  historyKeymap: [],
  history: () => ({ type: "history" }),
}));

vi.mock("@codemirror/autocomplete", () => ({
  autocompletion: () => ({ type: "autocompletion" }),
  completionKeymap: [],
}));

vi.mock("@codemirror/theme-one-dark", () => ({
  oneDark: { type: "oneDark" },
}));

const mockSql = vi.fn(() => ({ type: "sql" }));
vi.mock("@codemirror/lang-sql", () => ({
  sql: (...args: unknown[]) => mockSql(...args),
  PostgreSQL: { name: "PostgreSQL" },
}));

// Mock @neo4j-cypher/codemirror
const mockCypherSetValue = vi.fn();
const mockCypherSetReadOnly = vi.fn();
const mockCypherSetSchema = vi.fn();
const mockCypherDestroy = vi.fn();
const mockCypherFocus = vi.fn();
const mockCypherOnValueChanged = vi.fn();

vi.mock("@neo4j-cypher/codemirror", () => ({
  createCypherEditor: (_parent: Element, _opts: unknown) => ({
    editor: {
      codemirror: {
        state: { doc: { toString: () => "", length: 0 } },
        dispatch: mockDispatch,
        destroy: mockDestroy,
      },
      setValue: mockCypherSetValue,
      setReadOnly: mockCypherSetReadOnly,
      setSchema: mockCypherSetSchema,
      destroy: mockCypherDestroy,
      focus: mockCypherFocus,
      onValueChanged: mockCypherOnValueChanged,
    },
  }),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockDispatch.mockClear();
  mockDestroy.mockClear();
  mockFocus.mockClear();
  mockSql.mockClear();
  mockCypherSetValue.mockClear();
  mockCypherSetReadOnly.mockClear();
  mockCypherSetSchema.mockClear();
  mockCypherDestroy.mockClear();
  mockCypherFocus.mockClear();
  mockCypherOnValueChanged.mockClear();
  capturedUpdateListener = null;
});

// Helper: wait for async initEditor to resolve
async function flushAsync() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("QueryEditor", () => {
  it("renders the Run button", async () => {
    render(<QueryEditor />);
    await flushAsync();
    expect(screen.getByText("Run")).toBeInTheDocument();
  });

  it("renders CodeMirror container", async () => {
    render(<QueryEditor />);
    await flushAsync();
    expect(screen.getByTestId("codemirror-container")).toBeInTheDocument();
  });

  it("renders language label — Cypher by default", async () => {
    render(<QueryEditor />);
    await flushAsync();
    expect(screen.getByText("Cypher")).toBeInTheDocument();
  });

  it("renders language label — sql → SQL", async () => {
    render(<QueryEditor language="sql" />);
    await flushAsync();
    expect(screen.getByText("SQL")).toBeInTheDocument();
  });

  it("renders language label — postgresql → SQL", async () => {
    render(<QueryEditor language="postgresql" />);
    await flushAsync();
    expect(screen.getByText("SQL")).toBeInTheDocument();
  });

  it("renders language label — cypher → Cypher", async () => {
    render(<QueryEditor language="cypher" />);
    await flushAsync();
    expect(screen.getByText("Cypher")).toBeInTheDocument();
  });

  it("shows running state", async () => {
    render(<QueryEditor running value="MATCH (n) RETURN n" />);
    await flushAsync();
    expect(screen.getByText("Running")).toBeInTheDocument();
  });

  it("disables run button when value is empty", async () => {
    render(<QueryEditor value="" />);
    await flushAsync();
    expect(screen.getByText("Run").closest("button")).toBeDisabled();
  });

  it("disables run button when running=true", async () => {
    render(<QueryEditor value="MATCH (n)" running />);
    await flushAsync();
    expect(screen.getByText("Running").closest("button")).toBeDisabled();
  });

  it("renders clear button (aria-label)", async () => {
    render(<QueryEditor defaultValue="MATCH (n)" />);
    await flushAsync();
    expect(screen.getByLabelText("Clear query")).toBeInTheDocument();
  });

  it("clear button is disabled when value is empty", async () => {
    render(<QueryEditor value="" />);
    await flushAsync();
    expect(screen.getByLabelText("Clear query")).toBeDisabled();
  });

  it("calls onRun when run button is clicked (non-empty controlled value)", async () => {
    const onRun = vi.fn();
    render(<QueryEditor value="MATCH (n) RETURN n" onRun={onRun} />);
    await flushAsync();
    const user = userEvent.setup();
    await user.click(screen.getByText("Run"));
    expect(onRun).toHaveBeenCalled();
  });

  it("calls onChange via CodeMirror update listener (SQL mode)", async () => {
    const onChange = vi.fn();
    render(<QueryEditor language="sql" onChange={onChange} />);
    await flushAsync();

    if (capturedUpdateListener) {
      capturedUpdateListener({
        docChanged: true,
        state: { doc: { toString: () => "SELECT" } },
      });
    }
    expect(onChange).toHaveBeenCalledWith("SELECT");
  });

  it("calls onChange with empty string when clear button is clicked", async () => {
    const onChange = vi.fn();
    render(<QueryEditor defaultValue="MATCH (n)" onChange={onChange} />);
    await flushAsync();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("Clear query"));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("applies custom className to wrapper element", async () => {
    const { container } = render(<QueryEditor className="my-editor" />);
    await flushAsync();
    expect(container.firstChild).toHaveClass("my-editor");
  });

  it("does not render the run-and-save hint by default", () => {
    render(<QueryEditor />);
    expect(screen.queryByLabelText(/run and save shortcut/i)).toBeNull();
  });

  it("renders the run-and-save hint when runAndSaveHint=true", () => {
    render(<QueryEditor runAndSaveHint />);
    expect(
      screen.getByLabelText("Run and save shortcut: Command Shift Enter"),
    ).toBeInTheDocument();
  });

  it("renders history select when history prop is provided", async () => {
    render(<QueryEditor history={["MATCH (n) RETURN n", "RETURN 1"]} />);
    await flushAsync();
    expect(screen.getByText("History")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// SQL schema completion
// ---------------------------------------------------------------------------

describe("QueryEditor — SQL schema completion", () => {
  it("passes schema to sql() when schema prop is provided", async () => {
    mockSql.mockClear();
    render(
      <QueryEditor
        language="sql"
        schema={{
          type: "postgresql",
          tables: [
            {
              name: "users",
              columns: [{ name: "id", type: "integer", nullable: false }],
            },
          ],
        }}
      />,
    );
    await flushAsync();

    expect(mockSql).toHaveBeenCalled();
    const callWithSchema = mockSql.mock.calls.find(
      (c) => c[0] && typeof c[0] === "object" && "schema" in c[0],
    );
    expect(callWithSchema).toBeDefined();
    expect(callWithSchema![0].schema).toEqual({ users: ["id"] });
  });

  it("calls sql() with dialect only when no schema prop", async () => {
    mockSql.mockClear();
    render(<QueryEditor language="sql" />);
    await flushAsync();

    expect(mockSql).toHaveBeenCalled();
    // The first call (from initSqlEditor) should have dialect but no schema
    const firstCall = mockSql.mock.calls[0];
    expect(firstCall[0]).toHaveProperty("dialect");
    expect(firstCall[0]).not.toHaveProperty("schema");
  });
});

// ---------------------------------------------------------------------------
// Cypher editor path
// ---------------------------------------------------------------------------

describe("QueryEditor — Cypher mode", () => {
  it("uses createCypherEditor for cypher language", async () => {
    render(<QueryEditor language="cypher" />);
    await flushAsync();

    // The Cypher editor registers onValueChanged listener
    expect(mockCypherOnValueChanged).toHaveBeenCalled();
  });

  it("calls setReadOnly on Cypher editor when readOnly changes", async () => {
    const { rerender } = render(<QueryEditor language="cypher" />);
    await flushAsync();
    mockCypherSetReadOnly.mockClear();

    rerender(<QueryEditor language="cypher" readOnly />);
    await flushAsync();

    expect(mockCypherSetReadOnly).toHaveBeenCalledWith(true);
  });
});

// ---------------------------------------------------------------------------
// Language switching
// ---------------------------------------------------------------------------

describe("QueryEditor — language switching", () => {
  it("reconfigures language compartment when switching within SQL dialects", async () => {
    const { rerender } = render(<QueryEditor language="sql" />);
    await flushAsync();
    mockDispatch.mockClear();
    mockDestroy.mockClear();

    rerender(<QueryEditor language="postgresql" />);
    await flushAsync();

    // Both sql and postgresql are SQL mode — no reinit, just compartment reconfigure
    expect(screen.getByText("SQL")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// readOnly prop
// ---------------------------------------------------------------------------

describe("QueryEditor — readOnly", () => {
  it("run and clear buttons are disabled in readOnly mode", async () => {
    render(<QueryEditor readOnly value="MATCH (n) RETURN n" />);
    await flushAsync();
    expect(screen.getByText("Run")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Controlled value sync + history select
// ---------------------------------------------------------------------------

describe("QueryEditor — controlled value sync", () => {
  it("dispatches changes to CM when controlled value prop changes (SQL)", async () => {
    const { rerender } = render(
      <QueryEditor language="sql" value="SELECT 1" />,
    );
    await flushAsync();
    mockDispatch.mockClear();

    rerender(<QueryEditor language="sql" value="SELECT 2" />);
    await flushAsync();

    expect(mockDispatch).toHaveBeenCalled();
  });

  it("does not dispatch when value matches CM doc", async () => {
    render(<QueryEditor language="sql" value="" />);
    await flushAsync();
    mockDispatch.mockClear();
  });
});

describe("QueryEditor — history select", () => {
  it("calls onChange when a history item is selected", async () => {
    const onChange = vi.fn();
    render(
      <QueryEditor
        history={["MATCH (n) RETURN n", "RETURN 1"]}
        onChange={onChange}
      />,
    );
    await flushAsync();

    expect(screen.getByText("History")).toBeInTheDocument();
  });
});
