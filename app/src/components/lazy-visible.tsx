"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

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
 * Mounts its children only while the slot is in (or near) the viewport, and
 * UNMOUNTS them once scrolled away.
 *
 * Used to cap how many WebGL-backed graph widgets are live at once: browsers
 * allow only ~16 simultaneous WebGL contexts, and each NVL graph holds one, so
 * a graph-dense dashboard would otherwise evict older contexts ("Too many
 * active WebGL contexts") and leave dead canvases (#1052). Unmounting an
 * off-screen graph releases its context; it re-mounts from cached data on
 * scroll-back.
 */
export function LazyVisible({
  children,
  rootMargin = "300px",
  fallback,
  className,
}: LazyVisibleProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Without IntersectionObserver (very old browsers, some test envs) fall
    // back to always-mounted so nothing silently disappears. Deferred so it's
    // not a synchronous setState inside the effect body.
    if (typeof IntersectionObserver === "undefined") {
      const t = setTimeout(() => setVisible(true), 0);
      return () => clearTimeout(t);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setVisible(entry.isIntersecting);
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return (
    <div ref={ref} className={className}>
      {visible ? children : fallback}
    </div>
  );
}
