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
  let body: string;
  if (widgetCount === 0) {
    body = `It has no widgets.${shareCount > 0 ? ` The ${people} access.` : ""}`;
  } else {
    body = `Its ${pluralWidgets(widgetCount)} and ${pluralPages(pageCount)} go with it${shareCount > 0 ? `, and the ${people} access` : ""}.`;
  }
  return `${body} This can't be undone.`;
}
