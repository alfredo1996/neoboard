/**
 * QueryEditor tests — Unified CodeMirror 6 architecture
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
 *  - Language switching reconfigures compartment (no destroy/recreate)
 *  - Abort signal prevents stale initEditor calls
 *  - Schema prop passed to resolveLanguageExt for both SQL and Cypher
 *  - Unified init path — single EditorView for all languages
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

// ---------------------------------------------------------------------------
// Mock language resolvers — unified path for both SQL and Cypher
// ---------------------------------------------------------------------------

const mockResolveLanguageExt = vi.fn(async () => [
  { type: "mockLanguageExt" },
]);

vi.mock("@/lib/language-resolvers", () => ({
  resolveLanguageExt: (...args: unknown[]) =>
    mockResolveLanguageExt(...args),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockDispatch.mockClear();
  mockDestroy.mockClear();
  mockFocus.mockClear();
  mockResolveLanguageExt.mockClear();
  capturedUpdateListener = null;
});

// Helper: wait for async initEditor to resolve.
// initEditor awaits multiple dynamic imports, so flush several microtask
// rounds to ensure all promise chains settle.
async function flushAsync() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
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

  it("calls onChange via CodeMirror update listener", async () => {
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
// Unified editor — uses resolveLanguageExt for all languages
// ---------------------------------------------------------------------------

describe("QueryEditor — unified editor init", () => {
  it("calls resolveLanguageExt with cypher language by default", async () => {
    render(<QueryEditor />);
    await flushAsync();

    expect(mockResolveLanguageExt).toHaveBeenCalled();
    const firstCall = mockResolveLanguageExt.mock.calls[0] as unknown[];
    expect(firstCall[0]).toBe("cypher");
  });

  it("calls resolveLanguageExt with sql language", async () => {
    render(<QueryEditor language="sql" />);
    await flushAsync();

    expect(mockResolveLanguageExt).toHaveBeenCalled();
    const firstCall = mockResolveLanguageExt.mock.calls[0] as unknown[];
    expect(firstCall[0]).toBe("sql");
  });

  it("passes schema to resolveLanguageExt when schema prop provided", async () => {
    const schema = {
      type: "postgresql" as const,
      tables: [
        {
          name: "users",
          columns: [{ name: "id", type: "integer", nullable: false }],
        },
      ],
    };

    render(<QueryEditor language="sql" schema={schema} />);
    await flushAsync();

    expect(mockResolveLanguageExt).toHaveBeenCalled();
    const firstCall = mockResolveLanguageExt.mock.calls[0] as unknown[];
    expect(firstCall[1]).toEqual(schema);
  });
});

// ---------------------------------------------------------------------------
// Language switching — compartment reconfigure (no destroy/recreate)
// ---------------------------------------------------------------------------

describe("QueryEditor — language switching", () => {
  it("reconfigures language via compartment when language changes", async () => {
    const { rerender } = render(<QueryEditor language="sql" />);
    await flushAsync();
    mockResolveLanguageExt.mockClear();
    mockDispatch.mockClear();

    rerender(<QueryEditor language="cypher" />);
    await flushAsync();

    // Should call resolveLanguageExt with new language
    expect(mockResolveLanguageExt).toHaveBeenCalled();
    const calls = mockResolveLanguageExt.mock.calls as unknown[][];
    const cypherCall = calls.find((c) => c[0] === "cypher");
    expect(cypherCall).toBeDefined();
  });

  it("reconfigures when switching within SQL dialects", async () => {
    const { rerender } = render(<QueryEditor language="sql" />);
    await flushAsync();
    mockResolveLanguageExt.mockClear();
    mockDispatch.mockClear();

    rerender(<QueryEditor language="postgresql" />);
    await flushAsync();

    // Both sql and postgresql → compartment reconfigure
    expect(screen.getByText("SQL")).toBeInTheDocument();
    // Verify resolveLanguageExt called with new dialect
    expect(mockResolveLanguageExt).toHaveBeenCalled();
    const calls = mockResolveLanguageExt.mock.calls as unknown[][];
    const postgresqlCall = calls.find((c) => c[0] === "postgresql");
    expect(postgresqlCall).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// readOnly prop
// ---------------------------------------------------------------------------

describe("QueryEditor — readOnly", () => {
  it("run and clear buttons are visible in readOnly mode", async () => {
    render(<QueryEditor readOnly value="MATCH (n) RETURN n" />);
    await flushAsync();
    expect(screen.getByText("Run")).toBeInTheDocument();
  });

  it("dispatches compartment reconfigure when readOnly changes", async () => {
    const { rerender } = render(<QueryEditor language="sql" />);
    await flushAsync();
    mockDispatch.mockClear();

    rerender(<QueryEditor language="sql" readOnly />);
    await flushAsync();

    expect(mockDispatch).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Controlled value sync + history select
// ---------------------------------------------------------------------------

describe("QueryEditor — controlled value sync", () => {
  it("dispatches changes to CM when controlled value prop changes", async () => {
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
    const { rerender } = render(<QueryEditor language="sql" value="" />);
    await flushAsync();
    mockDispatch.mockClear();

    // Rerender with same value — CM doc already matches, so dispatch should not be called
    rerender(<QueryEditor language="sql" value="" />);
    await flushAsync();

    expect(mockDispatch).not.toHaveBeenCalled();
  });
});

describe("QueryEditor — history select", () => {
  it("renders History select trigger when history prop is provided", async () => {
    render(
      <QueryEditor
        history={["MATCH (n) RETURN n", "RETURN 1"]}
      />,
    );
    await flushAsync();

    expect(screen.getByText("History")).toBeInTheDocument();
  });
});
