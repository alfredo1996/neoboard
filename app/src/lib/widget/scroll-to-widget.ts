/**
 * Shared widget scroll + highlight helpers.
 *
 * Used by both the dashboard viewer and editor pages to scroll to a widget
 * after cross-page navigation.
 */

/**
 * Scrolls to and highlights a widget on the current page.
 * Uses `CSS.escape` to safely handle widget IDs that contain CSS-special
 * characters (e.g. colons, brackets).
 *
 * Returns `true` if the element was found and scrolled to.
 */
export function scrollAndHighlight(widgetId: string): boolean {
  const el = document.querySelector(
    `[data-widget-id="${CSS.escape(widgetId)}"]`,
  );
  if (el && !el.closest(".hidden")) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("widget-highlight");

    // `animationend` alone leaks the class: it never fires when the pulse is
    // interrupted (that dispatches `animationcancel`) and never fires at all
    // under `prefers-reduced-motion`, where the global reset in
    // design-tokens.css sets `animation: none` (#1458). Listen for both events
    // and keep a timer as the backstop for the no-animation case — 2s clears
    // the 1.5s pulse in globals.css with margin.
    const clear = () => {
      clearTimeout(timer);
      el.removeEventListener("animationend", onOwnAnimationDone);
      el.removeEventListener("animationcancel", onOwnAnimationDone);
      el.classList.remove("widget-highlight");
    };
    // Both events bubble, and a widget card is full of things that animate on
    // their own (skeletons, spinners, ECharts). Without the target check, the
    // first descendant animation to finish would strip the highlight.
    const onOwnAnimationDone = (event: Event) => {
      if (event.target === el) clear();
    };
    // Declared after the handlers so it can be `const`; they only read it when
    // invoked, which is always after this line has run.
    const timer = setTimeout(clear, 2000);
    el.addEventListener("animationend", onOwnAnimationDone);
    el.addEventListener("animationcancel", onOwnAnimationDone);

    return true;
  }
  return false;
}

/**
 * Uses `requestAnimationFrame` polling to scroll to a widget after a
 * cross-page navigation. The target page may not have rendered yet, so we
 * retry up to `maxRetries` frames before giving up.
 *
 * Default retry budget is 30 frames (~500 ms at 60 fps) which is enough for
 * most page transitions including lazy-loaded widgets.
 */
export function scrollToWidgetWhenReady(
  widgetId: string,
  maxRetries = 30,
): void {
  let attempts = 0;
  function tryScroll() {
    if (scrollAndHighlight(widgetId)) return;
    if (++attempts < maxRetries) requestAnimationFrame(tryScroll);
  }
  requestAnimationFrame(tryScroll);
}
