/**
 * Lazy-loaded code syntax highlighter using Shiki.
 *
 * Provides a singleton highlighter that loads on first use.
 * Supports: sql, cypher, json, javascript, typescript, python, bash.
 * Falls back to plain text for unknown languages.
 */

import type { HighlighterCore } from "shiki/core";

const SUPPORTED_LANGS = [
  "sql",
  "cypher",
  "json",
  "javascript",
  "typescript",
  "python",
  "bash",
  "css",
  "html",
  "yaml",
] as const;

export type SupportedLang = (typeof SUPPORTED_LANGS)[number];

/** Language aliases (e.g. `js` → `javascript`) */
const LANG_ALIASES: Record<string, SupportedLang> = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  sh: "bash",
  shell: "bash",
  yml: "yaml",
  cypher: "cypher",
};

let highlighterPromise: Promise<HighlighterCore> | null = null;
let highlighterInstance: HighlighterCore | null = null;

function resolveLang(lang: string): SupportedLang | null {
  const lower = lang.toLowerCase().trim();
  if ((SUPPORTED_LANGS as readonly string[]).includes(lower))
    return lower as SupportedLang;
  return LANG_ALIASES[lower] ?? null;
}

async function getHighlighter(): Promise<HighlighterCore> {
  if (highlighterInstance) return highlighterInstance;
  if (highlighterPromise) return highlighterPromise;

  highlighterPromise = (async () => {
    const { createHighlighterCore } = await import("shiki/core");
    const { createOnigurumaEngine } = await import("shiki/engine/oniguruma");

    const instance = await createHighlighterCore({
      themes: [
        import("shiki/themes/github-light"),
        import("shiki/themes/github-dark"),
      ],
      langs: [
        import("shiki/langs/sql"),
        import("shiki/langs/json"),
        import("shiki/langs/javascript"),
        import("shiki/langs/typescript"),
        import("shiki/langs/python"),
        import("shiki/langs/bash"),
        import("shiki/langs/css"),
        import("shiki/langs/html"),
        import("shiki/langs/yaml"),
        import("shiki/langs/cypher"),
      ],
      engine: createOnigurumaEngine(import("shiki/wasm")),
    });

    highlighterInstance = instance;
    return instance;
  })();

  return highlighterPromise;
}

/**
 * Highlight a code string and return HTML.
 * Returns null if the highlighter isn't loaded yet (caller should show fallback).
 */
export function highlightSync(code: string, lang: string): string | null {
  if (!highlighterInstance) return null;
  const resolved = resolveLang(lang);
  if (!resolved) return null;

  try {
    return highlighterInstance.codeToHtml(code, {
      lang: resolved,
      themes: { light: "github-light", dark: "github-dark" },
    });
  } catch {
    return null;
  }
}

/**
 * Ensure the highlighter is loaded. Returns true when ready.
 * Call from a React effect to trigger loading.
 */
export async function ensureHighlighter(): Promise<boolean> {
  try {
    await getHighlighter();
    return true;
  } catch {
    return false;
  }
}
