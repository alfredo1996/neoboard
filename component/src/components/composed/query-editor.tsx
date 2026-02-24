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
import type { DatabaseSchema } from "./schema-browser";

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
  schema?: DatabaseSchema;
  readOnly?: boolean;
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSchemaWords(schema: DatabaseSchema | undefined): string[] {
  if (!schema) return [];
  const words: string[] = [];

  if (schema.labels) words.push(...schema.labels);
  if (schema.relationshipTypes) words.push(...schema.relationshipTypes);
  if (schema.nodeProperties) {
    Object.values(schema.nodeProperties).forEach((props) =>
      props.forEach((p) => words.push(p.name))
    );
  }
  if (schema.relProperties) {
    Object.values(schema.relProperties).forEach((props) =>
      props.forEach((p) => words.push(p.name))
    );
  }
  if (schema.tables) {
    schema.tables.forEach((t) => {
      words.push(t.name);
      t.columns.forEach((c) => words.push(c.name));
    });
  }

  return [...new Set(words)];
}

async function buildExtensions(
  language: string,
  schema: DatabaseSchema | undefined,
  placeholder: string,
  readOnly: boolean,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CM extension type is complex
  onUpdate: (newValue: string) => void,
  onRun: () => void
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic CM types
): Promise<any[]> {
  const [
    { EditorView, keymap, placeholder: cmPlaceholder },
    { EditorState },
    { defaultKeymap, historyKeymap, history: historyExt },
    { autocompletion, completionKeymap },
    { oneDark },
  ] = await Promise.all([
    import("@codemirror/view"),
    import("@codemirror/state"),
    import("@codemirror/commands"),
    import("@codemirror/autocomplete"),
    import("@codemirror/theme-one-dark"),
  ]);

  // Language
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic CM types
  const langExts: any[] = [];
  const lang = (language ?? "cypher").toLowerCase();
  if (lang === "sql" || lang === "postgresql") {
    const { sql } = await import("@codemirror/lang-sql");
    langExts.push(sql());
  }
  // Cypher: no first-party CM6 package on npm — plain text with schema autocompletion.

  // Schema autocompletion
  const schemaWords = buildSchemaWords(schema);
  const autocompleteExt =
    schemaWords.length > 0
      ? autocompletion({
          override: [
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CM context type
            (ctx: any) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CM matchBefore return
              const word: any = ctx.matchBefore(/\w*/);
              if (!word || (word.from === word.to && !ctx.explicit)) return null;
              return {
                from: word.from,
                options: schemaWords.map((label) => ({ label, type: "keyword" })),
              };
            },
          ],
        })
      : autocompletion();

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
    }
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
    ...langExts,
    autocompleteExt,
    cmPlaceholder(placeholder),
    oneDark,
    baseTheme,
    updateListener,
    EditorState.readOnly.of(readOnly),
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
  schema,
  readOnly = false,
  className,
}: QueryEditorProps) {
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const currentValue = value ?? internalValue;

  const containerRef = React.useRef<HTMLDivElement>(null);
  const viewRef = React.useRef<CMEditorView>(null);
  // Prevent the CM update listener from triggering onChange while we are
  // programmatically pushing a value into the editor.
  const suppressUpdate = React.useRef(false);

  // Keep the latest callbacks in refs so the stable closures passed to CM
  // always call the current function.
  const onChangeRef = React.useRef(onChange);
  const onRunRef = React.useRef(onRun);
  const runningRef = React.useRef(running);
  const currentValueRef = React.useRef(currentValue);
  React.useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  React.useEffect(() => { onRunRef.current = onRun; }, [onRun]);
  React.useEffect(() => { runningRef.current = running; }, [running]);
  React.useEffect(() => { currentValueRef.current = currentValue; }, [currentValue]);

  // Whether the component is in "controlled" mode (value prop provided)
  const isControlled = value !== undefined;

  // -------------------------------------------------------------------------
  // Create / recreate the CodeMirror editor
  // -------------------------------------------------------------------------
  const initEditor = React.useCallback(
    async (docValue: string, abortSignal: { aborted: boolean }) => {
      if (typeof window === "undefined" || !containerRef.current) return;

      // Tear down any existing view
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
      // Remove leftover DOM nodes
      while (containerRef.current.firstChild) {
        containerRef.current.removeChild(containerRef.current.firstChild);
      }

      const { EditorView } = await import("@codemirror/view");
      const { EditorState } = await import("@codemirror/state");

      // Guard: a newer initEditor call may have superseded this one.
      if (abortSignal.aborted) return;

      const onUpdate = (newValue: string) => {
        if (suppressUpdate.current) return;
        if (!isControlled) setInternalValue(newValue);
        onChangeRef.current?.(newValue);
      };

      const onRunCallback = () => {
        const v = viewRef.current?.state.doc.toString() ?? currentValueRef.current;
        if (v.trim() && !runningRef.current) {
          onRunRef.current?.(v);
        }
      };

      const extensions = await buildExtensions(
        language,
        schema,
        placeholder,
        readOnly,
        onUpdate,
        onRunCallback
      );

      // Guard again after the second batch of dynamic imports.
      if (abortSignal.aborted || !containerRef.current) return;

      const state = EditorState.create({ doc: docValue, extensions });
      viewRef.current = new EditorView({ state, parent: containerRef.current });
    },
    // Recreate when these change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [language, readOnly, schema, placeholder]
  );

  // Initial mount
  React.useEffect(() => {
    const abortSignal = { aborted: false };
    initEditor(currentValue, abortSignal);
    return () => {
      abortSignal.aborted = true;
      viewRef.current?.destroy();
      viewRef.current = null;
    };
    // Only runs once; language/schema changes are handled by the next effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recreate editor when language / readOnly / schema change (after mount)
  const isFirstRender = React.useRef(true);
  React.useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    // Preserve current document content across reinit
    const doc = viewRef.current?.state.doc.toString() ?? currentValueRef.current;
    const abortSignal = { aborted: false };
    initEditor(doc, abortSignal);
    return () => {
      abortSignal.aborted = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, readOnly, schema]);

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
    // Use React state (currentValue) as the authoritative source so the button
    // always uses the same value that governs its disabled state.
    if (currentValue.trim() && !running) {
      onRun?.(currentValue);
    }
  };

  const handleHistorySelect = (query: string) => {
    const view = viewRef.current;
    if (view) {
      suppressUpdate.current = true;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: query } });
      suppressUpdate.current = false;
    }
    if (!isControlled) setInternalValue(query);
    onChange?.(query);
  };

  const handleClear = () => {
    const view = viewRef.current;
    if (view) {
      suppressUpdate.current = true;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "" } });
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
    <div className={cn("rounded-lg border bg-muted/30 flex flex-col", className)}>
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
                  <SelectItem key={i} value={query} className="text-xs font-mono">
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
          <Button
            size="sm"
            className="h-7 gap-1"
            onClick={handleRun}
            disabled={!currentValue.trim() || running}
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
      />
    </div>
  );
}

export { QueryEditor };
