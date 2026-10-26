/** Bring a widget into view and ring it for a moment (a filter's selector, #2252/#2297). */
export function scrollToWidget(widgetId: string): void {
  const el = document.querySelector(`[data-widget-id="${widgetId}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("ring-2", "ring-primary", "rounded-lg");
  setTimeout(
    () => el.classList.remove("ring-2", "ring-primary", "rounded-lg"),
    1500,
  );
}
