import { useState, useRef, useEffect, useCallback } from "react";

interface ContainerSize {
  width: number;
  height: number;
}

/**
 * Hook to measure container size using ResizeObserver.
 * Returns `{ width, height, containerRef }` where `containerRef` is a
 * callback ref to attach to the element you want to measure.
 */
export function useContainerSize() {
  const [size, setSize] = useState<ContainerSize>({ width: 0, height: 0 });
  const observerRef = useRef<ResizeObserver | null>(null);

  const containerRef = useCallback((node: HTMLElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    if (node) {
      setSize({ width: node.offsetWidth, height: node.offsetHeight });

      observerRef.current = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) {
          const { width, height } = entry.contentRect;
          setSize({ width, height });
        }
      });
      observerRef.current.observe(node);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  return { width: size.width, height: size.height, containerRef };
}
