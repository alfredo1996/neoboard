// /design-sync slim-bundle stub for code-highlighter — drops Shiki (wasm +
// language grammars, ~1.5MB) from the design-tool bundle. MarkdownWidget still
// renders; code fences fall back to plain (unhighlighted) text.
export const SUPPORTED_LANGS = [] as const;
export type SupportedLang = string;
export function highlightSync(_code: string, _lang: string): string | null {
  return null;
}
export async function ensureHighlighter(): Promise<boolean> {
  return false;
}
