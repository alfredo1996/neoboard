/**
 * Dashboard tags (#1692) — the one place the shape is defined.
 *
 * Used by the create / update / import routes (validation) and by the list
 * page (input parsing, filtering). Kept pure so every rule has a unit test.
 */
import { z } from "zod";

export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 30;

/** Trimmed, non-empty, short strings; deduped so a chip never repeats. */
export const dashboardTagsSchema = z
  .array(z.string().trim().min(1).max(MAX_TAG_LENGTH))
  .max(MAX_TAGS)
  .transform((tags) => [...new Set(tags)]);

/** "a, b ,, a" → ["a", "b"] — the comma-separated input the dialogs use. */
export function parseTagsInput(input: string): string[] {
  return [
    ...new Set(
      input
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ];
}

/** Exact-match tag filter. Empty tag ⇒ all items. */
export function filterDashboardsByTag<T extends { tags: string[] }>(
  dashboards: T[],
  tag: string,
): T[] {
  if (!tag) return dashboards;
  return dashboards.filter((d) => d.tags.includes(tag));
}

/** Sorted, unique tags across a list — feeds the filter Select. */
export function collectDashboardTags(
  dashboards: ReadonlyArray<{ tags: string[] }>,
): string[] {
  return [...new Set(dashboards.flatMap((d) => d.tags))].sort((a, b) =>
    a.localeCompare(b),
  );
}
