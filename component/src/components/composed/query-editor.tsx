import * as React from "react";
import { Play, Loader2, RotateCcw, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { resolveLanguageExt } from "@/lib/language-resolvers";
import type { DatabaseSchema } from "@/lib/schema-transforms";

// ---------------------------------------------------------------------------
// CodeMirror type aliases (dynamic imports — never imported at module level
// so the heavy editor code is only loaded in the browser).
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- opaque CM view
type CMEditorView = any;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface QueryEditorProps {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onRun?: (query: string) => void;
  running?: boolean;
  history?: string[];
  placeholder?: string;
  /** "cypher" | "sql" selects the language extension */
  language?: "cypher" | "sql" | string;
  readOnly?: boolean;
  className?: string;
  /** When provided, a hint for the run-and-save keyboard shortcut is displayed next to the Run button. */
  runAndSaveHint?: boolean;
  /** Schema for autocompletion. Passed from the app layer. */
  schema?: DatabaseSchema;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function buildExtensions(
  placeholder: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CM extension type is complex
  onUpdate: (newValue: string) => void,
  onRun: () => void,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CM Compartment-wrapped extension
  langCompartmentExt: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CM Compartment-wrapped extension
  readOnlyCompartmentExt: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic CM types
): Promise<any[]> {
  const [
    { EditorView, keymap, placeholder: cmPlaceholder },
    { defaultKeymap, historyKeymap, history: historyExt },
    { autocompletion, completionKeymap },
    { oneDark },
  ] = await Promise.all([
    import("@codemirror/view"),
    import("@codemirror/commands"),
    import("@codemirror/autocomplete"),
    import("@codemirror/theme-one-dark"),
  ]);

  // Cmd/Ctrl+Enter → run
  const runKeymap = keymap.of([
    {
      key: "Ctrl-Enter",
      mac: "Cmd-Enter",
      run: () => {
        onRun();
        return true;
      },
    },
  ]);

  // Value change listener
  const updateListener = EditorView.updateListener.of(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CM ViewUpdate
    (update: any) => {
      if (update.docChanged) {
        onUpdate(update.state.doc.toString());
      }
    },
  );

  const baseTheme = EditorView.theme({
    "&": { height: "100%", minHeight: "120px" },
    ".cm-scroller": {
      overflow: "auto",
      fontFamily: "var(--font-mono, monospace)",
      fontSize: "0.875rem",
    },
    ".cm-content": { padding: "1rem" },
  });

  return [
    historyExt(),
    keymap.of([...defaultKeymap, ...historyKeymap, ...completionKeymap]),
    runKeymap,
    langCompartmentExt,
    autocompletion(),
    cmPlaceholder(placeholder),
    oneDark,
    baseTheme,
    updateListener,
    readOnlyCompartmentExt,
  ];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function QueryEditor({
  value,
  defaultValue = "",
  onChange,
  onRun,
  running = false,
  history,
  placeholder = "Enter your query...",
  language = "cypher",
  readOnly = false,
  className,
  runAndSaveHint = false,
  schema,
}: QueryEditorProps) {
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const currentValue = value ?? internalValue;

  const containerRef = React.useRef<HTMLDivElement>(null);
  const viewRef = React.useRef<CMEditorView>(null);
  // Prevent the CM update listener from triggering onChange while we are
  // programmatically pushing a value into the editor.
  const suppressUpdate = React.useRef(false);

  // Keep the latest callbacks and prop values in refs so the async initEditor
  // closure always reads the current values when it finishes initialising.
  const onChangeRef = React.useRef(onChange);
  const onRunRef = React.useRef(onRun);
  const runningRef = React.useRef(running);
  const currentValueRef = React.useRef(currentValue);
  // language and readOnly can change while initEditor is still awaiting module
  // imports. Track them in refs so initEditor picks up the latest values when
  // it creates the editor, preventing a readOnly-stuck-on-true race condition.
  const languageRef = React.useRef(language);
  const readOnlyRef = React.useRef(readOnly);
  const schemaRef = React.useRef(schema);
  React.useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  React.useEffect(() => {
    onRunRef.current = onRun;
  }, [onRun]);
  React.useEffect(() => {
    runningRef.current = running;
  }, [running]);
  React.useEffect(() => {
    currentValueRef.current = currentValue;
  }, [currentValue]);
  React.useEffect(() => {
    languageRef.current = language;
  }, [language]);
  React.useEffect(() => {
    readOnlyRef.current = readOnly;
  }, [readOnly]);
  React.useEffect(() => {
    schemaRef.current = schema;
  }, [schema]);

  // Shared abort signal so any new initEditor call cancels the previous one.
  const initAbortRef = React.useRef<{ aborted: boolean }>({ aborted: false });

  // Whether the component is in "controlled" mode (value prop provided)
  const isControlled = value !== undefined;

  // Compartment refs — used to reconfigure language and readOnly in-place
  // without destroying and re-creating the editor.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- opaque CM Compartment
  const languageCompartmentRef = React.useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- opaque CM Compartment
  const readOnlyCompartmentRef = React.useRef<any>(null);
  // Cache EditorState after first load so the readOnly effect can reconfigure
  // the compartment synchronously (no extra async import tick).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- opaque CM EditorState
  const editorStateRef = React.useRef<any>(null);

  // -------------------------------------------------------------------------
  // Cleanup helper
  // -------------------------------------------------------------------------
  function destroyEditor() {
    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }
  }

  // -------------------------------------------------------------------------
  // Create the CodeMirror editor — unified path for all languages
  // -------------------------------------------------------------------------
  const initEditor = React.useCallback(
    async (docValue: string, abortSignal: { aborted: boolean }) => {
      // Cancel any previous in-flight init so we don't end up with two editors.
      initAbortRef.current.aborted = true;
      initAbortRef.current = abortSignal;

      // Tear down any existing editor
      destroyEditor();

      if (typeof window === "undefined" || !containerRef.current) return;

      // Remove leftover DOM nodes and clear the ready signal
      delete containerRef.current.dataset.editorReady;
      while (containerRef.current.firstChild) {
        containerRef.current.removeChild(containerRef.current.firstChild);
      }

      const [{ EditorView }, { EditorState, Compartment }] = await Promise.all(
        [import("@codemirror/view"), import("@codemirror/state")],
      );

      if (abortSignal.aborted) return;

      editorStateRef.current = EditorState;

      const langCompartment = new Compartment();
      const readOnlyCompartment = new Compartment();
      languageCompartmentRef.current = langCompartment;
      readOnlyCompartmentRef.current = readOnlyCompartment;

      // Capture the schema at the start — it may change while we await imports.
      const initialSchema = schemaRef.current;
      const langExts = await resolveLanguageExt(
        languageRef.current,
        initialSchema,
      );
      if (abortSignal.aborted) return;

      const onUpdate = (newValue: string) => {
        if (suppressUpdate.current) return;
        if (!isControlled) setInternalValue(newValue);
        onChangeRef.current?.(newValue);
      };

      const onRunCallback = () => {
        const v =
          viewRef.current?.state.doc.toString() ?? currentValueRef.current;
        if (v.trim() && !runningRef.current) {
          onRunRef.current?.(v);
        }
      };

      const extensions = await buildExtensions(
        placeholder,
        onUpdate,
        onRunCallback,
        langCompartment.of(langExts),
        readOnlyCompartment.of(EditorState.readOnly.of(readOnlyRef.current)),
      );

      if (abortSignal.aborted || !containerRef.current) return;

      const state = EditorState.create({ doc: docValue, extensions });
      viewRef.current = new EditorView({ state, parent: containerRef.current });

      // If the schema arrived while we were awaiting imports, reconfigure now.
      if (schemaRef.current && schemaRef.current !== initialSchema) {
        await resolveLanguageExt(languageRef.current, schemaRef.current)
          .then((updatedExts) => {
            if (!abortSignal.aborted && viewRef.current) {
              viewRef.current.dispatch({
                effects: langCompartment.reconfigure(updatedExts),
              });
            }
          })
          .catch(() => {
            // Defensive: dynamic import or language extension init can fail
          });
      }

      containerRef.current?.setAttribute("data-editor-ready", "true");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [placeholder],
  );

  // Initial mount
  React.useEffect(() => {
    const abortSignal = { aborted: false };
    initEditor(currentValue, abortSignal);
    return () => {
      abortSignal.aborted = true;
      destroyEditor();
      // Clear leftover DOM children to prevent duplicate editors.
      if (containerRef.current) {
        while (containerRef.current.firstChild) {
          containerRef.current.removeChild(containerRef.current.firstChild);
        }
      }
    };
    // Only runs once; language/readOnly changes are handled by effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Language change: reconfigure the language compartment in place.
  // No destroy/recreate — cursor position, undo history, and scroll are preserved.
  React.useEffect(() => {
    if (!viewRef.current || !languageCompartmentRef.current) return;
    let cancelled = false;
    resolveLanguageExt(language, schemaRef.current)
      .then((exts) => {
        if (!cancelled && viewRef.current) {
          viewRef.current.dispatch({
            effects: languageCompartmentRef.current.reconfigure(exts),
          });
        }
      })
      .catch(() => {
        // Defensive: dynamic import or language extension init can fail
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  // readOnly: synchronous compartment reconfigure — one path for all languages
  React.useEffect(() => {
    const view = viewRef.current;
    const compartment = readOnlyCompartmentRef.current;
    const EditorState = editorStateRef.current;
    if (!view || !compartment || !EditorState) return;
    view.dispatch({
      effects: compartment.reconfigure(EditorState.readOnly.of(readOnly)),
    });
  }, [readOnly]);

  // Schema update: reconfigure language compartment with new schema
  React.useEffect(() => {
    if (!schema || !viewRef.current || !languageCompartmentRef.current) return;
    resolveLanguageExt(language, schema)
      .then((exts) => {
        if (viewRef.current) {
          viewRef.current.dispatch({
            effects: languageCompartmentRef.current.reconfigure(exts),
          });
        }
      })
      .catch(() => {
        // Defensive: dynamic import or language extension init can fail
      });
  }, [schema, language]);

  // -------------------------------------------------------------------------
  // Sync controlled `value` into the editor when it changes externally
  // -------------------------------------------------------------------------
  React.useEffect(() => {
    if (!isControlled) return;
    const view = viewRef.current;
    if (!view) return;
    const doc = view.state.doc.toString();
    if (doc !== value) {
      suppressUpdate.current = true;
      view.dispatch({ changes: { from: 0, to: doc.length, insert: value } });
      suppressUpdate.current = false;
    }
  }, [value, isControlled]);

  // -------------------------------------------------------------------------
  // UI handlers
  // -------------------------------------------------------------------------
  const handleRun = () => {
    if (currentValue.trim() && !running) {
      onRun?.(currentValue);
    }
  };

  const handleHistorySelect = (query: string) => {
    const view = viewRef.current;
    if (view) {
      suppressUpdate.current = true;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: query },
      });
      suppressUpdate.current = false;
    }
    if (!isControlled) setInternalValue(query);
    onChange?.(query);
  };

  const handleClear = () => {
    const view = viewRef.current;
    if (view) {
      suppressUpdate.current = true;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: "" },
      });
      suppressUpdate.current = false;
      view.focus();
    }
    if (!isControlled) setInternalValue("");
    onChange?.("");
  };

  const languageLabel =
    language === "sql" || language === "postgresql"
      ? "SQL"
      : language === "cypher"
        ? "Cypher"
        : (language ?? "Cypher");

  return (
    <div
      className={cn("rounded-xl border bg-muted/30 flex flex-col", className)}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b px-3 py-2 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {languageLabel}
          </span>
          {history && history.length > 0 && (
            <Select onValueChange={handleHistorySelect}>
              <SelectTrigger className="h-7 w-auto gap-1 border-none bg-transparent text-xs text-muted-foreground hover:text-foreground">
                <Clock className="h-3 w-3" />
                <SelectValue placeholder="History" />
              </SelectTrigger>
              <SelectContent>
                {history.map((query, i) => (
                  <SelectItem
                    key={i}
                    value={query}
                    className="text-xs font-mono"
                  >
                    {query.length > 60 ? query.slice(0, 60) + "..." : query}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleClear}
            disabled={!currentValue || running}
            aria-label="Clear query"
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
          {runAndSaveHint && (
            <span
              className="hidden sm:inline-flex items-center text-[10px] text-muted-foreground select-none mr-1"
              aria-label="Run and save shortcut: Command Shift Enter"
              title="Run & Save: ⌘⇧↵ / Ctrl+Shift+Enter"
            >
              <kbd className="font-mono">⌘⇧↵</kbd>
              <span className="ml-1">Run &amp; Save</span>
            </span>
          )}
          <Button
            size="sm"
            className="h-7 gap-1"
            onClick={handleRun}
            disabled={!currentValue.trim() || running}
            title="Run query (Ctrl+Enter / ⌘+Enter)"
          >
            {running ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Play className="h-3 w-3" />
            )}
            {running ? "Running" : "Run"}
          </Button>
        </div>
      </div>

      {/* CodeMirror mount point */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden [&_.cm-editor]:h-full [&_.cm-scroller]:overflow-auto"
        data-testid="codemirror-container"
        data-readonly={readOnly}
      />
    </div>
  );
}

export { QueryEditor };
