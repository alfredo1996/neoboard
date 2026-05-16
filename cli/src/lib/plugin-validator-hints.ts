/**
 * Human hints for plugin validator failures.
 * Each hint is one line and links to the plugin authoring docs.
 *
 * Keep this file independent of `output.ts` so the hints can be tested
 * without dragging in spinners / chalk / TTY plumbing.
 */

export const PLUGIN_DOCS_URL =
  "https://github.com/alfredo1996/neoboard/blob/main/docs/src/content/docs/developer/extending/new-chart-plugin.mdx";

interface HintRule {
  /** Substring (case-insensitive) that identifies the validator error. */
  match: string;
  /** Actionable one-liner. The docs URL is appended automatically. */
  hint: string;
}

const RULES: HintRule[] = [
  {
    match: '"type" must be a non-empty string',
    hint: 'Add `type: "unique-id"` to your plugin object — this is the chart/connector identifier.',
  },
  {
    match: '"label" must be a non-empty string',
    hint: 'Add `label: "Display Name"` — this is what users see in the chart picker.',
  },
  {
    match: '"compatibleWith" must be a non-empty array',
    hint: 'Add `compatibleWith: ["neo4j", "postgresql"]` — chart plugins must declare which connector types they support.',
  },
  {
    match: '"category" must be one of',
    hint: 'Set `category` to one of: "database", "graph", "api", "file" on your connector plugin.',
  },
  {
    match: "Not a valid NeoBoard plugin",
    hint: "Export a chart plugin (object with a `transform` function) or a connector plugin (object with a `createModule` function).",
  },
  {
    match: "Plugin export must be an object",
    hint: "Export a plain object — not a class instance, function, or array. Use `export default { type, label, transform, ... }`.",
  },
];

/**
 * Look up a hint for a validator error message. Returns null when nothing
 * is recognized so callers can stay silent rather than guess.
 */
export function hintForValidatorError(message: string): string | null {
  const lower = message.toLowerCase();
  for (const rule of RULES) {
    if (lower.includes(rule.match.toLowerCase())) {
      return `${rule.hint} See: ${PLUGIN_DOCS_URL}`;
    }
  }
  return null;
}

/**
 * Hint for "package has no <X> export" — suggest a usable `--export` value
 * when the package actually has other named exports.
 *
 * - `requested` is the export name the user asked for (or "default").
 * - `available` is the list of property names on the imported module.
 *
 * Returns null when no useful suggestion exists (e.g., package is empty,
 * or the only export is the one the user already tried).
 */
export function hintForMissingExport(
  requested: string,
  available: string[],
): string | null {
  // Filter out the name the user tried, and "default" when suggesting a
  // named export (the user got here precisely because "default" didn't work).
  const candidates = available.filter(
    (name) => name !== requested && name !== "default",
  );
  if (candidates.length === 0) return null;

  const list = candidates
    .slice(0, 5)
    .map((c) => `"${c}"`)
    .join(", ");
  return `The package exports ${list}. Try: --export ${candidates[0]}`;
}
