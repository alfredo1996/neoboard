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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryEditor } from "../query-editor";

// ---------------------------------------------------------------------------
// Mock CodeMirror dynamic imports
// ---------------------------------------------------------------------------

const mockDispatch = vi.fn();
const mockDestroy = vi.fn();
const mockFocus = vi.fn();
/** CodeMirror's closeCompletion: true when it closed an open list. */
const mockCloseCompletion = vi.fn((_view: unknown) => false);

// Track the update listener callback so tests can trigger it
let capturedUpdateListener:
  | ((update: {
      docChanged: boolean;
      state: { doc: { toString: () => string } };
    }) => void)
  | null = null;

let lastStateConfig: { extensions: unknown[] } | null = null;

vi.mock("@codemirror/view", () => {
  class FakeEditorView {
    state = { doc: { toString: () => "", length: 0 } };
    dispatch = mockDispatch;
    destroy = mockDestroy;
    focus = mockFocus;
    dom = document.createElement("div");
    constructor(config: { parent?: HTMLElement }) {
      config.parent?.appendChild(this.dom);
    }
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
      contentAttributes: {
        of: (attrs: Record<string, string>) => ({
          type: "contentAttributes",
          attrs,
        }),
      },
      theme: (_spec: unknown, opts?: { dark?: boolean }) => ({
        type: "theme",
        dark: opts?.dark,
      }),
    }),
    keymap: {
      of: () => ({ type: "keymap" }),
    },
    placeholder: (text: string) => ({ type: "placeholder", text }),
  };
});

vi.mock("@codemirror/state", () => ({
  EditorState: {
    create: (config: unknown) => {
      lastStateConfig = config as { extensions: unknown[] };
      return { type: "state", config };
    },
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
  closeCompletion: (view: unknown) => mockCloseCompletion(view),
  autocompletion: () => ({ type: "autocompletion" }),
  completionKeymap: [],
  closeBrackets: () => ({ type: "closeBrackets" }),
  closeBracketsKeymap: [],
}));

vi.mock("../query-editor-highlight", () => ({
  lightHighlightStyle: { type: "lightHighlight" },
  darkHighlightStyle: { type: "oneDarkHighlight" },
}));

vi.mock("@codemirror/language", () => ({
  defaultHighlightStyle: { type: "defaultHighlight" },
  syntaxHighlighting: (style: unknown) => ({ type: "highlight", style }),
}));

// ---------------------------------------------------------------------------
// Mock language resolvers — unified path for both SQL and Cypher
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock accepts any args
const mockResolveLanguageExt = vi.fn<(...args: any[]) => Promise<object[]>>(
  async () => [{ type: "mockLanguageExt" }],
);

vi.mock("@/lib/language-resolvers", () => ({
  resolveLanguageExt: (...args: unknown[]) => mockResolveLanguageExt(...args),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockDispatch.mockClear();
  mockDestroy.mockClear();
  mockFocus.mockClear();
  mockCloseCompletion.mockClear();
  mockResolveLanguageExt.mockClear();
  capturedUpdateListener = null;
});

// Ensure no dangling timers leak between tests
afterEach(() => {
  vi.clearAllTimers();
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

  it("renders no language label by default — a plain editor (#1895)", async () => {
    render(<QueryEditor />);
    await flushAsync();
    expect(screen.getByTestId("codemirror-container")).toBeInTheDocument();
    expect(screen.queryByTestId("query-editor-language")).toBeNull();
    expect(screen.queryByText("Cypher")).toBeNull();
    expect(screen.queryByText("SQL")).toBeNull();
  });

  it("renders language label — sql → SQL", async () => {
    render(<QueryEditor language="sql" />);
    await flushAsync();
    expect(screen.getByTestId("query-editor-language")).toHaveTextContent(
      "SQL",
    );
  });

  it("shows an unmapped language verbatim — the label map holds languages only (#1895)", async () => {
    render(<QueryEditor language="some-connector-type" />);
    await flushAsync();
    expect(screen.getByTestId("query-editor-language")).toHaveTextContent(
      "some-connector-type",
    );
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
  it("calls resolveLanguageExt with no language (plain text) by default", async () => {
    render(<QueryEditor />);
    await flushAsync();

    expect(mockResolveLanguageExt).toHaveBeenCalled();
    const firstCall = mockResolveLanguageExt.mock.calls[0] as unknown[];
    expect(firstCall[0]).toBe("");
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
      type: "any-tabular-connector",
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

  it("reconfigures to plain text when the language is cleared", async () => {
    const { rerender } = render(<QueryEditor language="sql" />);
    await flushAsync();
    mockResolveLanguageExt.mockClear();
    mockDispatch.mockClear();

    rerender(<QueryEditor language="" />);
    await flushAsync();

    expect(screen.queryByTestId("query-editor-language")).toBeNull();
    const calls = mockResolveLanguageExt.mock.calls as unknown[][];
    expect(calls.find((c) => c[0] === "")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Placeholder switching — compartment reconfigure (regression: placeholder
// stayed on the Cypher example after switching the connection to SQL)
// ---------------------------------------------------------------------------

describe("QueryEditor — placeholder switching", () => {
  it("reconfigures the placeholder compartment when the placeholder prop changes", async () => {
    const { rerender } = render(
      <QueryEditor
        language="cypher"
        placeholder="MATCH (n) RETURN n.name AS name LIMIT 10"
      />,
    );
    await flushAsync();
    mockDispatch.mockClear();

    rerender(
      <QueryEditor language="sql" placeholder="SELECT * FROM users LIMIT 10" />,
    );
    await flushAsync();

    const placeholderDispatch = mockDispatch.mock.calls.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ([arg]: any[]) =>
        arg?.effects?.ext?.type === "placeholder" &&
        arg?.effects?.ext?.text === "SELECT * FROM users LIMIT 10",
    );
    expect(placeholderDispatch).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Accessible name (#2345) — CodeMirror's .cm-content is a role=textbox
// ---------------------------------------------------------------------------

describe("QueryEditor — accessible name", () => {
  const contentAttrs = () =>
    (
      lastStateConfig?.extensions as {
        type?: string;
        ext?: { type?: string; attrs?: Record<string, string> };
      }[]
    ).find((e) => e?.ext?.type === "contentAttributes")?.ext?.attrs;

  it.each([
    ["nothing given", {}, { "aria-label": "Query editor" }],
    [
      "aria-label given",
      { "aria-label": "SQL query" },
      { "aria-label": "SQL query" },
    ],
    [
      "aria-labelledby given",
      { "aria-labelledby": "q-heading" },
      { "aria-labelledby": "q-heading" },
    ],
  ])("content attributes when %s", async (_n, props, expected) => {
    render(<QueryEditor language="sql" {...props} />);
    await flushAsync();
    expect(contentAttrs()).toEqual(expected);
  });

  it("reconfigures the content attributes when the name props change", async () => {
    const { rerender } = render(<QueryEditor language="sql" aria-label="A" />);
    await flushAsync();
    mockDispatch.mockClear();
    rerender(<QueryEditor language="sql" aria-label="B" />);
    await flushAsync();
    const ext = mockDispatch.mock.calls
      .map(([tr]) => (tr as { effects?: { ext?: unknown } }).effects?.ext)
      .find((x) => (x as { type?: string })?.type === "contentAttributes");
    expect(ext).toEqual(
      expect.objectContaining({ attrs: { "aria-label": "B" } }),
    );
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

  // The theme compartment holds [theme({dark}), highlight(style)].
  type Ext = { dark?: boolean; type?: string; style?: { type: string } };
  const themeParts = (ext: unknown) =>
    Array.isArray(ext) ? (ext as Ext[]) : [];
  const flagOf = (ext: unknown) =>
    themeParts(ext).find((e) => e.dark !== undefined)?.dark;
  const styleOf = (ext: unknown) =>
    themeParts(ext).find((e) => e.type === "highlight")?.style?.type;
  const initialThemeExt = () =>
    (lastStateConfig?.extensions as { type?: string; ext?: unknown }[])
      .filter((e) => e.type === "compartment.of")
      .map((e) => e.ext)
      .find((x) => flagOf(x) !== undefined);
  const reconfiguredThemeExts = () =>
    mockDispatch.mock.calls
      .map(([tr]) => (tr as { effects?: { ext?: unknown } }).effects?.ext)
      .filter((x) => flagOf(x) !== undefined);
  const setDark = (on: boolean) =>
    act(async () => {
      document.documentElement.classList.toggle("dark", on);
    });

  it("themes the editor from <html class>: light first, dark live, same view (#2329)", async () => {
    document.documentElement.classList.remove("dark");
    render(<QueryEditor language="sql" />);
    await flushAsync();

    expect(flagOf(initialThemeExt())).toBe(false);
    expect(styleOf(initialThemeExt())).toBe("lightHighlight");

    mockDispatch.mockClear();
    mockDestroy.mockClear();
    await setDark(true);
    await flushAsync();
    document.documentElement.classList.remove("dark");

    const [switched] = reconfiguredThemeExts();
    expect(flagOf(switched)).toBe(true);
    expect(styleOf(switched)).toBe("oneDarkHighlight");
    expect(mockDestroy).not.toHaveBeenCalled();
  });

  it("reuses the theme extensions across toggles, so no stylesheet is added per toggle (#2329)", async () => {
    document.documentElement.classList.remove("dark");
    render(<QueryEditor language="sql" />);
    await flushAsync();
    const firstLight = initialThemeExt();

    mockDispatch.mockClear();
    await setDark(true);
    await flushAsync();
    await setDark(false);
    await flushAsync();

    const light = reconfiguredThemeExts().find((x) => flagOf(x) === false);
    expect(light).toBe(firstLight);
  });

  it("applies a theme change that lands while the editor is still starting (#2329)", async () => {
    document.documentElement.classList.remove("dark");
    let release: (v: object[]) => void = () => {};
    mockResolveLanguageExt.mockImplementationOnce(
      () => new Promise((r) => (release = r)),
    );
    render(<QueryEditor language="sql" />);
    await flushAsync();
    await setDark(true);
    await act(async () => release([{ type: "mockLanguageExt" }]));
    await flushAsync();
    document.documentElement.classList.remove("dark");

    const last = [initialThemeExt(), ...reconfiguredThemeExts()].pop();
    expect(flagOf(last)).toBe(true);
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
    render(<QueryEditor history={["MATCH (n) RETURN n", "RETURN 1"]} />);
    await flushAsync();

    expect(screen.getByText("History")).toBeInTheDocument();
  });
});

// #2054: a dialog around the editor hears Escape before CodeMirror does — Radix
// listens on the document in the capture phase — so Escape on an open
// completion list closed the dialog and left the list. The list is the layer
// the user is in, so it takes the key.
describe("QueryEditor — Escape on the completion list (#2054)", () => {
  /** What a dialog's document capture listener would hear. */
  function listenLikeADialog() {
    const heard = vi.fn();
    document.addEventListener("keydown", heard, { capture: true });
    return {
      heard,
      stop: () =>
        document.removeEventListener("keydown", heard, { capture: true }),
    };
  }

  function editorDom() {
    const dom = screen.getByTestId("codemirror-container").firstElementChild;
    expect(dom).not.toBeNull();
    return dom as HTMLElement;
  }

  it("closes an open list and nothing else hears the key", async () => {
    render(<QueryEditor />);
    await flushAsync();
    const dialog = listenLikeADialog();
    mockCloseCompletion.mockReturnValueOnce(true);

    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    editorDom().dispatchEvent(event);
    dialog.stop();

    expect(mockCloseCompletion).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
    expect(dialog.heard).not.toHaveBeenCalled();
  });

  it("with no list open, lets Escape through to the dialog", async () => {
    render(<QueryEditor />);
    await flushAsync();
    const dialog = listenLikeADialog();

    editorDom().dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    dialog.stop();

    expect(mockCloseCompletion).toHaveBeenCalledOnce();
    expect(dialog.heard).toHaveBeenCalledOnce();
  });

  it("leaves Escape outside the editor, and other keys, alone", async () => {
    render(<QueryEditor />);
    await flushAsync();

    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    editorDom().dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", bubbles: true }),
    );

    expect(mockCloseCompletion).not.toHaveBeenCalled();
  });
});
