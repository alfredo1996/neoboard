/**
 * Dashboard tags (#1692): one cleanup rule, shared by the PUT route and the
 * Edit details dialog. Same limits as widget template tags.
 */
import { z } from "zod";

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

/** The API's rule: clean first, then check the limits on what is left. */
export const dashboardTagsSchema = z
  .array(z.string())
  .transform(cleanDashboardTags)
  .pipe(z.array(z.string().max(MAX_TAG_LENGTH)).max(MAX_TAGS));

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

export type DetailsSavePlan =
  | { nameError: string | null; tagsError: string | null }
  | { nothing: true }
  | { changes: { name?: string; tags?: string[] } };

/** What the Edit details dialog does on save: show errors, close, or send only the changed fields. */
export function planDetailsSave(
  target: { name: string; tags: readonly string[] },
  nameInput: string,
  tagsInput: string,
): DetailsSavePlan {
  const name = nameInput.trim();
  const parsed = parseTagsInput(tagsInput);
  if (!name || !parsed.ok) {
    return {
      nameError: name ? null : "Enter a name.",
      tagsError: parsed.ok ? null : parsed.error,
    };
  }
  const changes: { name?: string; tags?: string[] } = {};
  if (name !== target.name) changes.name = name;
  if (parsed.tags.join("\n") !== target.tags.join("\n")) {
    changes.tags = parsed.tags;
  }
  return Object.keys(changes).length === 0 ? { nothing: true } : { changes };
}
