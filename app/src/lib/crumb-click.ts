import type { MouseEvent } from "react";

/**
 * A crumb's click handler: a plain left click runs `go` instead of the
 * link; Cmd/Ctrl/Shift-click and middle-click keep the browser's own
 * (open in a new tab or window).
 */
export function crumbClick(go: () => void) {
  return (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    go();
  };
}
