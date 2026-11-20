/**
 * Parameter suggestions for the query editor (#2485). The app hands in the
 * parameters a connection's concepts set, already spelled as a query uses
 * them; this only offers them after a `$` and never touches the query beyond
 * the completion the user picks.
 */
import type { EditorView } from "@codemirror/view";
import type {
  Completion,
  CompletionContext,
  CompletionResult,
  CompletionSource,
} from "@codemirror/autocomplete";

export interface ParameterSuggestion {
  /** As it is written in a query, `$` included. */
  label: string;
  /** What it filters. */
  detail: string;
}

export function parameterSource(
  getParams: () => readonly ParameterSuggestion[] | undefined,
): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    const params = getParams() ?? [];
    const word = context.matchBefore(/\$\w*/);
    if (!word || params.length === 0) return null;
    // `from` is after the `$`, where the language's own sources start:
    // CodeMirror lists only the sources that share a start. The label carries
    // the `$`, so applying one replaces it.
    return {
      from: word.from + 1,
      options: params.map((p) => ({
        ...p,
        type: "variable",
        // After a `$` nothing else is a parameter, and the list is long.
        boost: 99,
        apply: (
          view: EditorView,
          completion: Completion,
          from: number,
          to: number,
        ) =>
          view.dispatch({
            changes: { from: from - 1, to, insert: completion.label },
            selection: { anchor: from - 1 + completion.label.length },
          }),
      })),
    };
  };
}
