import { completeFromList } from "@codemirror/autocomplete";
import type {
  Completion,
  CompletionContext,
  CompletionResult,
  CompletionSource,
} from "@codemirror/autocomplete";

/**
 * The completion sources the editor adds through language data (#2485), as one
 * source. A language that sets `autocompletion({ override })`, as Cypher does,
 * ignores language data; listing this beside its own source lets the editor
 * add suggestions to it the way it does to SQL.
 */
export const languageDataSources: CompletionSource = async (
  context: CompletionContext,
): Promise<CompletionResult | null> => {
  const sources = context.state.languageDataAt<
    CompletionSource | readonly Completion[]
  >("autocomplete", context.pos);
  for (const source of sources) {
    const result = await (
      typeof source === "function" ? source : completeFromList([...source])
    )(context);
    if (result) return result;
  }
  return null;
};
