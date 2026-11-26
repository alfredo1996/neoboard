/**
 * Dashboard tags (#1692): one cleanup rule, shared by the PUT route and the
 * Edit details dialog. Same limits as widget template tags.
 */
export const MAX_TAGS = 20;
export const MAX_TAG_LENGTH = 100;

/** Trim, drop empties, drop duplicates ignoring case (the first spelling stays). */
export function cleanDashboardTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim();
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

export type ParsedTags =
  { ok: true; tags: string[] } | { ok: false; error: string };

/** The dialog's comma-separated input, cleaned and checked against the limits. */
export function parseTagsInput(input: string): ParsedTags {
  const tags = cleanDashboardTags(input.split(","));
  if (tags.length > MAX_TAGS) {
    return { ok: false, error: `At most ${MAX_TAGS} tags.` };
  }
  if (tags.some((t) => t.length > MAX_TAG_LENGTH)) {
    return {
      ok: false,
      error: `A tag can be at most ${MAX_TAG_LENGTH} characters.`,
    };
  }
  return { ok: true, tags };
}
