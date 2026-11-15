/**
 * Which dashboard pages stay mounted behind the active one (#1475). Unbounded,
 * a tab tour left 131 tiles, 87 canvases and 146 MB of heap, and each graph
 * holds a WebGL context (browsers allow ~16). Three keeps back-and-forth
 * instant: an evicted page re-renders from the TanStack cache inside its
 * staleTime, with no query.
 */
export const PAGE_MOUNT_CAP = 3;

/**
 * Widget ids of form widgets holding input that is not submitted yet. That
 * input lives in the renderer's local state, so unmounting its page loses it.
 */
export const dirtyFormWidgets = new Set<string>();

/**
 * `order` is the mounted pages, least recently visited first. Returns it with
 * `index` made most recent, then drops the oldest pages beyond the cap, except
 * `index` itself and any page `isDirty` reports.
 */
export function touchPage(
  order: number[],
  index: number,
  isDirty: (page: number) => boolean,
): number[] {
  const next = [...order.filter((p) => p !== index), index];
  for (let i = 0; next.length > PAGE_MOUNT_CAP && i < next.length - 1;) {
    if (isDirty(next[i])) i++;
    else next.splice(i, 1);
  }
  return next;
}
