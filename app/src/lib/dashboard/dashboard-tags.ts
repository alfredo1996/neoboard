/**
 * Dashboard tags (#1692) — the one place the shape is defined.
 *
 * Used by the create / update / import routes (validation) and by the list
 * page (input parsing, filtering). Kept pure so every rule has a unit test.
 */
import { z } from "zod";

export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 30;

/**
 * The filter Select's "every tag" value. Longer than any tag the schema
 * admits, so a dashboard tagged "all" can still be filtered on.
 */
export const ALL_TAGS = "*".repeat(MAX_TAG_LENGTH + 1);

/**
 * Trimmed, non-empty, short, comma-free strings; deduped so a chip never
 * repeats. The messages double as the dialogs' inline errors, so they are
 * written for people, not for logs.
 */
export const dashboardTagsSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1, "Tags cannot be empty")
      .max(
        MAX_TAG_LENGTH,
        `Each tag must be ${MAX_TAG_LENGTH} characters or fewer`,
      )
      // The dialogs split their input on "," — a stored comma would be
      // re-split on the next save.
      .refine((t) => !t.includes(","), "Tags cannot contain commas"),
  )
  .max(MAX_TAGS, `Use at most ${MAX_TAGS} tags`)
  .transform((tags) => [...new Set(tags)]);

/** Why the schema would reject `tags`, or null — shown before the round-trip. */
export function tagsInputError(tags: string[]): string | null {
  const parsed = dashboardTagsSchema.safeParse(tags);
  return parsed.success ? null : parsed.error.issues[0].message;
}

/** Element-wise equality — the edit dialog's "nothing changed" check. */
export function sameTags(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((t, i) => t === b[i]);
}

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
