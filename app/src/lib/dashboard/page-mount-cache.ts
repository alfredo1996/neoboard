/**
 * Which dashboard pages stay mounted behind the active one (#1475). Unbounded,
 * a tab tour left 131 tiles, 87 canvases and 146 MB of heap, and each graph
 * holds a WebGL context (browsers allow ~16). Three keeps back-and-forth
 * instant: an evicted page re-renders from the TanStack cache inside its
 * staleTime, with no query.
 */
export const PAGE_MOUNT_CAP = 3;

/**
 * `order` is the mounted page ids, least recently visited first. Returns it
 * with `id` made most recent, then drops the oldest form-free pages beyond the
 * cap. The page just opened is never dropped.
 *
 * ponytail: a page with a form widget is never dropped and does not count
 * against the cap. A form keeps unsubmitted input and an in-flight submit in
 * its own state, and tracking "dirty" precisely missed cases (cleared
 * external values, a field edited mid-submit). Forms are cheap to keep; the
 * memory is in tiles, canvases and graphs. Ceiling: a dashboard where every
 * page has a form keeps every page mounted, as before #1475. Upgrade path:
 * track dirtiness again only if that dashboard shows up.
 */
export function touchPage(
  order: string[],
  id: string,
  hasForm: (pageId: string) => boolean,
): string[] {
  const next = [...order.filter((p) => p !== id), id];
  let excess = next.filter((p) => !hasForm(p)).length - PAGE_MOUNT_CAP;
  return next.filter((p) => {
    if (excess <= 0 || p === id || hasForm(p)) return true;
    excess--;
    return false;
  });
}
