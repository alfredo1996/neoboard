"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  claimSlot,
  dropSlot,
  evictOverBudget,
  type BudgetSlot,
} from "@/lib/widget/webgl-budget";

interface LazyVisibleProps {
  children: ReactNode;
  /**
   * Margin around the viewport that still counts as "visible", so the content
   * mounts slightly before it scrolls in and unmounts only once it's well past.
   */
  rootMargin?: string;
  /** Rendered while the content is not mounted (keeps the slot's size stable). */
  fallback?: ReactNode;
  className?: string;
}

/**
 * Mounts its children only once the slot reaches (or nears) the viewport, and
 * unmounts them again only under WebGL pressure.
 *
 * The two directions are deliberately asymmetric. First mount stays gated on
 * intersection, so a graph-dense dashboard doesn't build every WebGL context on
 * initial load (#1052). Unmount is gated on the live-slot budget in
 * `lib/widget/webgl-budget`: while the page is under budget an off-screen slot
 * keeps its children mounted, because tearing a graph down and rebuilding it
 * restarts NVL's force layout and visibly reshuffles the nodes (#1367). Over
 * budget, the oldest off-screen slots are evicted to release their contexts.
 */
export function LazyVisible({
  children,
  rootMargin = "300px",
  fallback,
  className,
}: LazyVisibleProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  // This slot's entry in the page-wide budget. Created in a state initialiser,
  // not a ref, because writing a ref during render is forbidden here (#975).
  // `onScreen` starts true so that only a real IntersectionObserver report can
  // ever make the slot evictable: the eager-mount fallback below constructs no
  // observer, and a slot that starts off-screen would be evicted with no way
  // back, leaving a permanently blank tile.
  const [slot] = useState<BudgetSlot>(() => ({
    onScreen: true,
    evict: () => setVisible(false),
  }));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Construct the observer defensively: if IntersectionObserver is missing
    // or not constructable (very old browsers, some test envs), mount eagerly
    // rather than hide content or crash. Deferred so it's not a synchronous
    // setState inside the effect body.
    let observer: IntersectionObserver;
    try {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            slot.onScreen = entry.isIntersecting;
            // Never `setVisible(false)` from here — leaving the viewport is not
            // by itself a reason to unmount. Only the budget decides that, and
            // it does so by calling this slot's `evict`.
            if (entry.isIntersecting) setVisible(true);
            else evictOverBudget();
          }
        },
        { rootMargin },
      );
    } catch {
      const t = setTimeout(() => setVisible(true), 0);
      return () => clearTimeout(t);
    }
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin, slot]);

  useEffect(() => {
    if (!visible) return;
    claimSlot(slot);
    return () => dropSlot(slot);
  }, [visible, slot]);

  return (
    <div ref={ref} className={className}>
      {visible ? children : fallback}
    </div>
  );
}
