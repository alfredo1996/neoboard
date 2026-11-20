/**
 * Parameter suggestions for the query editor (#2485). The app hands in the
 * parameters a connection's concepts set, already spelled as a query uses
 * them; this only offers them after a `$` and never touches the query beyond
 * the completion the user picks.
 */
import type { EditorState } from "@codemirror/state";
import type {
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
    // From the `$`: the label carries it, and the default apply replaces what
    // was typed. Sources merge, and the list opens at the earliest `from`.
    return {
      from: word.from,
      options: params.map((p) => ({
        ...p,
        type: "variable",
        // After a `$` nothing else is a parameter, and the list is long.
        boost: 99,
      })),
    };
  };
}

/**
 * The extension that adds the source beside the language's own, in every
 * language. `CMState` is the lazily loaded `@codemirror/state`, passed in so
 * this file stays free of runtime CodeMirror imports. One source object:
 * CodeMirror tells its sources apart by identity.
 */
export function parameterExtension(
  CMState: typeof EditorState,
  getParams: () => readonly ParameterSuggestion[] | undefined,
) {
  const source = parameterSource(getParams);
  return CMState.languageData.of(() => [{ autocomplete: source }]);
}
