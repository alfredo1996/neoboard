/**
 * Which dashboard pages stay mounted behind the active one (#1475). Unbounded,
 * a tab tour left 131 tiles, 87 canvases and 146 MB of heap, and each graph
 * holds a WebGL context (browsers allow ~16). Three keeps back-and-forth
 * instant: an evicted page re-renders from the TanStack cache inside its
 * staleTime, with no query.
 */
export const PAGE_MOUNT_CAP = 3;

const dirtyForms = new Map<string, number>();

/**
 * Pins a form widget whose input is not submitted yet; that input lives in the
 * renderer's local state, so unmounting its page loses it. Counted, because
 * the fullscreen copy shares the widget id. Returns the release.
 */
export function pinForm(widgetId: string): () => void {
  dirtyForms.set(widgetId, (dirtyForms.get(widgetId) ?? 0) + 1);
  return () => {
    const n = (dirtyForms.get(widgetId) ?? 1) - 1;
    if (n > 0) dirtyForms.set(widgetId, n);
    else dirtyForms.delete(widgetId);
  };
}

export const isFormDirty = (widgetId: string) => dirtyForms.has(widgetId);

/**
 * `order` is the mounted page ids, least recently visited first. Returns it
 * with `id` made most recent, then drops the oldest pages beyond the cap,
 * except `id` itself and any page `isDirty` reports.
 */
export function touchPage(
  order: string[],
  id: string,
  isDirty: (pageId: string) => boolean,
): string[] {
  const next = [...order.filter((p) => p !== id), id];
  let i = 0;
  while (next.length > PAGE_MOUNT_CAP && i < next.length - 1) {
    if (isDirty(next[i])) i++;
    else next.splice(i, 1);
  }
  return next;
}
