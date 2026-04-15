/**
 * Showcase manifest — single source of truth for demo seed content.
 *
 * Consumed by:
 *   - cli/src/commands/demo.ts (list / seed / reset subcommands)
 *   - scripts/seed-demo.mjs (iteration + --only filter)
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Canonical list of demo showcases. Order here is the order printed by
 * `neoboard demo list` and the order used when seeding without `--only`.
 */
export const SHOWCASES = [
  {
    key: "chart-gallery",
    label: "Chart Gallery",
    description: "One page per chart type — 17 pages covering every registered widget.",
    jsonPath: join(__dirname, "chart-gallery.json"),
  },
  {
    key: "click-actions",
    label: "Click Actions",
    description: "Interactive examples, one page per supported click-action type.",
    jsonPath: join(__dirname, "click-actions.json"),
  },
  {
    key: "transformations",
    label: "Transformations",
    description: "Before/after side-by-side for each supported transform.",
    jsonPath: join(__dirname, "transformations.json"),
  },
  {
    key: "rule-based-styling",
    label: "Rule-Based Styling",
    description: "One page per stylable chart, each with 2–3 rules on realistic thresholds.",
    jsonPath: join(__dirname, "rule-based-styling.json"),
  },
];

/** Set of valid showcase keys for fast lookup + validation. */
export const SHOWCASE_KEYS = new Set(SHOWCASES.map((s) => s.key));

/**
 * Parses a comma-separated `--only` string into a validated list of showcase keys.
 *
 * @param {string | undefined} raw - raw CLI value, e.g. "chart-gallery,click-actions"
 * @returns {string[] | undefined} parsed keys, or undefined if raw is empty
 * @throws if any key is not a known showcase
 */
export function parseOnlyFlag(raw) {
  if (!raw) return undefined;
  const keys = raw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  const invalid = keys.filter((k) => !SHOWCASE_KEYS.has(k));
  if (invalid.length > 0) {
    const valid = [...SHOWCASE_KEYS].join(", ");
    throw new Error(
      `Unknown showcase key(s): ${invalid.join(", ")}. Valid keys: ${valid}`,
    );
  }
  return keys;
}
