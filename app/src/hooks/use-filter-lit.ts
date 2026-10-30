"use client";

import { useEffect } from "react";

const focusVisible = (el: EventTarget | null) => {
  try {
    return el instanceof Element && el.matches(":focus-visible");
  } catch {
    return false;
  }
};

/**
 * Tells `onChange` whether a filter card is "lit" (#2369): the pointer is over
 * it, keyboard focus (`:focus-visible`, never a mouse click) is inside it, or
 * its list is open.
 *
 * Native listeners, not React's onMouseEnter/Leave: those follow the React
 * tree, so a portalled list counts as inside the card, and a list that closes
 * under the pointer fires no leave at all. DOM pointerleave fires as soon as
 * the pointer is on the list, and the open state (aria-expanded on the
 * trigger) is what holds the highlight meanwhile.
 */
export function useFilterLit(
  el: HTMLElement | null,
  enabled: boolean,
  onChange: (lit: boolean) => void,
) {
  useEffect(() => {
    if (!enabled || !el) return;
    let hover = false;
    let focus = false;
    let open = false;
    let last = false;
    const sync = () => {
      const lit = hover || focus || open;
      if (lit !== last) onChange((last = lit));
    };
    const readOpen = () => {
      open = el.querySelector('[aria-expanded="true"]') !== null;
      sync();
    };
    const enter = () => {
      hover = true;
      sync();
    };
    const leave = () => {
      hover = false;
      sync();
    };
    const focusIn = (e: FocusEvent) => {
      focus = focusVisible(e.target);
      sync();
    };
    const focusOut = (e: FocusEvent) => {
      if (!el.contains(e.relatedTarget as Node | null)) focus = false;
      sync();
    };
    const observer = new MutationObserver(readOpen);
    observer.observe(el, {
      attributes: true,
      attributeFilter: ["aria-expanded"],
      subtree: true,
    });
    el.addEventListener("pointerenter", enter);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("focusin", focusIn);
    el.addEventListener("focusout", focusOut);
    return () => {
      observer.disconnect();
      el.removeEventListener("pointerenter", enter);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("focusin", focusIn);
      el.removeEventListener("focusout", focusOut);
      if (last) onChange(false);
    };
  }, [el, enabled, onChange]);
}
