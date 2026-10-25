/** "1 widget", "3 widgets". */
export function pluralWidgets(count: number): string {
  return count === 1 ? "1 widget" : `${count} widgets`;
}

/** "1 page", "3 pages". */
export function pluralPages(count: number): string {
  return count === 1 ? "1 page" : `${count} pages`;
}

/** What deleting a dashboard takes with it, as the confirm's sentence (#2223). */
export function dashboardDeleteConsequences({
  widgetCount,
  pageCount,
  shareCount,
}: Readonly<{
  widgetCount: number;
  pageCount: number;
  shareCount: number;
}>): string {
  const people =
    shareCount === 1
      ? "1 person it's shared with loses"
      : `${shareCount} people it's shared with lose`;
  const shared = shareCount > 0;
  let body: string;
  if (widgetCount === 0) {
    body = "It has no widgets.";
    if (shared) body += ` The ${people} access.`;
  } else {
    const loses = shared ? `, and the ${people} access` : "";
    body = `Its ${pluralWidgets(widgetCount)} and ${pluralPages(pageCount)} go with it${loses}.`;
  }
  return `${body} This can't be undone.`;
}
